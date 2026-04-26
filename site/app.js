(function () {
  "use strict";

  const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

  /** @param {number} year @param {number} month 1-12 @param {number} day */
  function buildMonthGrid(year, month, weddingDay) {
    const d = new Date(year, month - 1, 1);
    const jsDow = d.getDay();
    const mondayOffset = jsDow === 0 ? 6 : jsDow - 1;
    const lastDate = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = 0; i < mondayOffset; i++) {
      days.push({ empty: true });
    }
    for (let n = 1; n <= lastDate; n++) {
      days.push({ empty: false, day: n, wedding: n === weddingDay });
    }
    const tail = 7 - (days.length % 7);
    if (tail < 7) {
      for (let i = 0; i < tail; i++) {
        days.push({ empty: true, pad: true });
      }
    }
    return days;
  }

  const calRoot = document.getElementById("wedding-calendar");
  const weekdaysEl = document.getElementById("calendar-weekdays");
  const gridEl = document.getElementById("calendar-grid");

  if (calRoot && weekdaysEl && gridEl) {
    const year = Number(calRoot.dataset.year) || 2026;
    const month = Number(calRoot.dataset.month) || 8;
    const weddingDay = Number(calRoot.dataset.weddingDay) || 23;

    WEEKDAYS.forEach((name) => {
      const el = document.createElement("div");
      el.className = "calendar__day-name";
      el.textContent = name;
      weekdaysEl.appendChild(el);
    });

    const grid = buildMonthGrid(year, month, weddingDay);
    grid.forEach((cell) => {
      const el = document.createElement("div");
      if (cell.empty) {
        if (cell.pad) {
          el.className = "calendar__day calendar__day--empty calendar__day--pad";
        } else {
          el.setAttribute("aria-hidden", "true");
          el.className = "calendar__day calendar__day--empty";
        }
        el.textContent = "";
      } else {
        el.className = "calendar__day" + (cell.wedding ? " calendar__day--wedding" : "");
        if (cell.wedding) {
          el.setAttribute("title", "День свадьбы, " + cell.day + " число");
          el.setAttribute("aria-current", "date");
          el.setAttribute("aria-label", "День свадьбы, " + cell.day);
          el.innerHTML =
            '<span class="visually-hidden">' +
            String(cell.day) +
            "</span><span class=\"calendar__heart\" aria-hidden=\"true\">♥</span>";
        } else {
          el.textContent = String(cell.day);
        }
      }
      gridEl.appendChild(el);
    });
  }

  const RSVP_API = "/api/rsvp";
  const DRINK_LABELS = {
    champagne: "шампанское",
    red: "вино красное",
    white: "вино белое",
    vodka: "водка",
    whiskey: "виски",
    cognac: "коньяк",
    none: "не пью алкоголь"
  };

  const rsvpForm = document.getElementById("rsvp-form");
  const rsvpSection = document.getElementById("anketa");
  const formThanks = document.getElementById("form-thanks");
  const formError = document.getElementById("form-error");
  const rsvpSubmit = document.getElementById("rsvp-submit");
  const alcoholNo = rsvpForm && rsvpForm.querySelector(".alcohol-no");
  const alcoholGroup = rsvpForm && rsvpForm.querySelectorAll("input[name='alcohol']");

  function buildDringSuggestings(form) {
    var selected = Array.prototype.slice.call(form.querySelectorAll("input[name='alcohol']:checked"), 0);
    if (selected.length === 0) return "";
    if (selected.length === 1 && selected[0].value === "none") {
      return DRINK_LABELS.none;
    }
    return selected
      .filter(function (x) {
        return x.value !== "none";
      })
      .map(function (x) {
        return DRINK_LABELS[x.value] || x.value;
      })
      .join(", ");
  }

  /** @param {HTMLFormElement} form */
  function buildRsvpPayload(form) {
    const attending = form.querySelector("input[name='attending']:checked");
    return {
      full_name: (form.querySelector("#full_name") && form.querySelector("#full_name").value.trim()) || "",
      attending: Boolean(attending && attending.value === "true"),
      stay_overnight: form.querySelector("#stay_overnight")
        ? Boolean(form.querySelector("#stay_overnight").checked)
        : false,
      dring_suggestings: buildDringSuggestings(form),
      allergy: (form.querySelector("#allergy") && form.querySelector("#allergy").value.trim()) || ""
    };
  }

  if (alcoholNo && alcoholGroup && rsvpForm) {
    alcoholGroup.forEach((el) => {
      el.addEventListener("change", function () {
        if (el === alcoholNo && el.checked) {
          alcoholGroup.forEach((a) => {
            if (a !== alcoholNo) a.checked = false;
          });
        } else if (alcoholNo && el !== alcoholNo && el.checked) {
          alcoholNo.checked = false;
        }
      });
    });
  }

  function setError(message) {
    if (!formError) return;
    if (message) {
      formError.textContent = message;
      formError.removeAttribute("hidden");
    } else {
      formError.textContent = "";
      formError.setAttribute("hidden", "hidden");
    }
  }

  if (rsvpForm && rsvpSection && formThanks) {
    rsvpForm.addEventListener("submit", function (e) {
      e.preventDefault();
      setError("");
      if (!rsvpForm.checkValidity()) {
        rsvpForm.reportValidity();
        return;
      }
      if (rsvpSubmit) {
        rsvpSubmit.disabled = true;
        rsvpSubmit.textContent = "Отправка…";
      }
      const body = buildRsvpPayload(rsvpForm);
      fetch(RSVP_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body)
      })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (t) {
              var msg = "Ошибка " + res.status;
              if (t) {
                try {
                  var j = JSON.parse(t);
                  if (j && j.message) msg = String(j.message);
                  else if (j && typeof j.error === "string") msg = j.error;
                  else if (t.length < 240) msg = t;
                } catch (_) {
                  if (t.length < 240) msg = t;
                }
              }
              throw new Error(msg);
            });
          }
          return res.text().then(function (t) {
            if (!t) return;
            try {
              return JSON.parse(t);
            } catch (_) {
              return;
            }
          });
        })
        .then(function () {
          rsvpSection.classList.add("is-sent");
          formThanks.removeAttribute("hidden");
          rsvpForm.setAttribute("aria-hidden", "true");
        })
        .catch(function (err) {
          setError(
            (err && err.message) || "Не удалось отправить. Попробуйте ещё раз."
          );
        })
        .then(function () {
          if (rsvpSubmit) {
            rsvpSubmit.disabled = false;
            rsvpSubmit.textContent = "Отправить";
          }
        });
    });
  }
})();
