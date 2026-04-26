import os
import sqlite3
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from jinja2 import Environment, FileSystemLoader, select_autoescape
from openpyxl import Workbook
import secrets

from pydantic import BaseModel, ConfigDict, Field, field_validator

APP_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(APP_DIR, "templates")

env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)

security = HTTPBasic()

def get_settings() -> Dict[str, str]:
    return {
        "ADMIN_USER": os.getenv("ADMIN_USER", "admin"),
        "ADMIN_PASS": os.getenv("ADMIN_PASS", "change_me"),
        "DB_PATH": os.getenv("DB_PATH", "/data/rsvp.db"),
    }

def require_admin(credentials: HTTPBasicCredentials = Depends(security)) -> None:
    s = get_settings()
    ok_user = secrets.compare_digest(credentials.username or "", s["ADMIN_USER"])
    ok_pass = secrets.compare_digest(credentials.password or "", s["ADMIN_PASS"])
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Basic"},
        )

def db_connect() -> sqlite3.Connection:
    s = get_settings()
    parent = os.path.dirname(s["DB_PATH"])
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(s["DB_PATH"])
    conn.row_factory = sqlite3.Row
    return conn

def _table_columns(conn: sqlite3.Connection) -> set[str]:
    return {str(row[1]) for row in conn.execute("PRAGMA table_info('rsvp_responses')")}


def db_init() -> None:
    conn = db_connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rsvp_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                full_name TEXT NOT NULL,
                with_partner INTEGER NOT NULL DEFAULT 0,
                attending INTEGER NOT NULL DEFAULT 1
            );
            """
        )
        # Миграции: добиваем отсутствующие поля
        for col, ddl in (
            ("attending", "ALTER TABLE rsvp_responses ADD COLUMN attending INTEGER NOT NULL DEFAULT 1"),
            (
                "stay_overnight",
                "ALTER TABLE rsvp_responses ADD COLUMN stay_overnight INTEGER NOT NULL DEFAULT 0",
            ),
            (
                "dring_suggestings",
                "ALTER TABLE rsvp_responses ADD COLUMN dring_suggestings TEXT NOT NULL DEFAULT ''",
            ),
            ("allergy", "ALTER TABLE rsvp_responses ADD COLUMN allergy TEXT NOT NULL DEFAULT ''"),
            (
                "overnight_plus1",
                "ALTER TABLE rsvp_responses ADD COLUMN overnight_plus1 INTEGER NOT NULL DEFAULT 0",
            ),
        ):
            if col not in _table_columns(conn):
                conn.execute(ddl)
        conn.execute("UPDATE rsvp_responses SET attending = 1 WHERE attending IS NULL")
        conn.commit()
    finally:
        conn.close()


class RsvpCreate(BaseModel):
    """
    Соответствует POST /api/rsvp (см. фронт: app.js buildRsvpPayload).
    with_partner / overnight_plus1: фронт шлёт только при согласованных смыслах
    (присутствие + ночёвка), на бэке при вставке ещё раз нормализуются.
    Поле dring_suggestings — как в API-контракте (доп. опечатка в имени сохраняется).
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    full_name: str = Field(..., min_length=1, max_length=200)
    attending: bool
    with_partner: bool = False
    stay_overnight: bool = False
    overnight_plus1: bool = False
    dring_suggestings: str = Field(default="", max_length=2000)
    allergy: str = Field(default="", max_length=2000)

    @field_validator("dring_suggestings", "allergy", mode="before")
    @classmethod
    def _null_to_str(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v)

app = FastAPI(title="InviteForWedd API", version="1.0.0")

@app.on_event("startup")
def _startup() -> None:
    db_init()

@app.get("/health", response_class=JSONResponse)
def health() -> Dict[str, Any]:
    return {"ok": True}

@app.post("/api/rsvp", response_class=JSONResponse)
async def create_rsvp(body: RsvpCreate) -> Dict[str, Any]:
    created_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")

    conn = db_connect()
    try:
        attending = 1 if body.attending else 0
        with_partner = 1 if (body.attending and body.with_partner) else 0
        stay_overnight = 1 if body.stay_overnight else 0
        overnight_plus1 = 1 if (body.stay_overnight and body.overnight_plus1) else 0
        conn.execute(
            """
            INSERT INTO rsvp_responses (
                created_at, full_name, with_partner, attending,
                stay_overnight, overnight_plus1, dring_suggestings, allergy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                created_at,
                body.full_name,
                with_partner,
                attending,
                stay_overnight,
                overnight_plus1,
                body.dring_suggestings,
                body.allergy,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "message": "Спасибо! Ответ сохранён."}

def fetch_rows() -> List[sqlite3.Row]:
    conn = db_connect()
    try:
        cur = conn.execute(
            """
            SELECT id, created_at, full_name, with_partner, attending,
                   stay_overnight, overnight_plus1, dring_suggestings, allergy
            FROM rsvp_responses ORDER BY id DESC
            """
        )
        return list(cur.fetchall())
    finally:
        conn.close()

def fetch_row(response_id: int) -> sqlite3.Row | None:
    conn = db_connect()
    try:
        cur = conn.execute(
            """
            SELECT id, created_at, full_name, with_partner, attending,
                   stay_overnight, overnight_plus1, dring_suggestings, allergy
            FROM rsvp_responses WHERE id = ?
            """,
            (response_id,),
        )
        row = cur.fetchone()
        return row
    finally:
        conn.close()

@app.get("/admin", response_class=HTMLResponse, dependencies=[Depends(require_admin)])
def admin_page() -> HTMLResponse:
    rows = fetch_rows()
    tpl = env.get_template("admin.html")
    html = tpl.render(rows=rows, total=len(rows))
    return HTMLResponse(content=html, status_code=200)


@app.get("/admin/edit/{response_id}", response_class=HTMLResponse, dependencies=[Depends(require_admin)])
def admin_edit_page(response_id: int) -> HTMLResponse:
    row = fetch_row(response_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    tpl = env.get_template("edit.html")
    html = tpl.render(r=row)
    return HTMLResponse(content=html, status_code=200)


@app.post("/admin/edit/{response_id}", dependencies=[Depends(require_admin)])
async def admin_edit_save(response_id: int, request: Request) -> RedirectResponse:
    form = await request.form()
    full_name = str(form.get("full_name", "")).strip()
    attending_raw = str(form.get("attending", "")).strip()
    with_partner_raw = str(form.get("with_partner", "")).strip()
    stay_overnight_raw = str(form.get("stay_overnight", "")).strip()
    overnight_plus1_raw = str(form.get("overnight_plus1", "")).strip()
    dring_suggestings = str(form.get("dring_suggestings", ""))[:2000]
    allergy = str(form.get("allergy", ""))[:2000]

    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")
    if len(full_name) > 200:
        raise HTTPException(status_code=400, detail="full_name is too long")

    for label, val in (
        ("attending", attending_raw),
        ("with_partner", with_partner_raw),
        ("stay_overnight", stay_overnight_raw),
        ("overnight_plus1", overnight_plus1_raw),
    ):
        if val not in {"1", "0"}:
            raise HTTPException(status_code=400, detail=f"{label} must be 0 or 1")

    attending = 1 if attending_raw == "1" else 0
    with_partner = 1 if with_partner_raw == "1" else 0
    stay_overnight = 1 if stay_overnight_raw == "1" else 0
    overnight_plus1 = 1 if overnight_plus1_raw == "1" else 0

    conn = db_connect()
    try:
        cur = conn.execute("SELECT id FROM rsvp_responses WHERE id = ?", (response_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Not found")
        conn.execute(
            """
            UPDATE rsvp_responses SET
                full_name = ?,
                with_partner = ?,
                attending = ?,
                stay_overnight = ?,
                overnight_plus1 = ?,
                dring_suggestings = ?,
                allergy = ?
            WHERE id = ?
            """,
            (
                full_name,
                with_partner,
                attending,
                stay_overnight,
                overnight_plus1,
                dring_suggestings,
                allergy,
                response_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return RedirectResponse(url="/admin", status_code=303)


@app.post("/admin/delete/{response_id}", dependencies=[Depends(require_admin)])
def admin_delete(response_id: int) -> RedirectResponse:
    conn = db_connect()
    try:
        conn.execute("DELETE FROM rsvp_responses WHERE id = ?", (response_id,))
        conn.commit()
    finally:
        conn.close()
    return RedirectResponse(url="/admin", status_code=303)

@app.get("/admin/export.xlsx", dependencies=[Depends(require_admin)])
def export_xlsx() -> StreamingResponse:
    rows = fetch_rows()

    wb = Workbook()
    ws = wb.active
    ws.title = "RSVP"

    ws.append(
        [
            "ID",
            "Дата/время",
            "Имя и фамилия",
            "С парой / +1 (with_partner)",
            "Планирует присутствовать",
            "Ночёвка",
            "+1 на ночёвку (overnight_plus1)",
            "Пожелания по напиткам (dring_suggestings)",
            "Аллергия / непереносимость",
        ]
    )
    for r in rows[::-1]:
        ws.append(
            [
                r["id"],
                r["created_at"],
                r["full_name"],
                "Да" if r["with_partner"] else "Нет",
                "Да" if r["attending"] else "Нет",
                "Да" if r["stay_overnight"] else "Нет",
                "Да" if r["overnight_plus1"] else "Нет",
                r["dring_suggestings"] or "",
                r["allergy"] or "",
            ]
        )

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)

    headers = {"Content-Disposition": 'attachment; filename="rsvp_responses.xlsx"'}
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )