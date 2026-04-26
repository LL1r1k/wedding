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

  var withCoupleMode = (function () {
    return window.location.pathname
      .split("/")
      .filter(function (p) {
        return p.length > 0;
      })
      .indexOf("plus_one") !== -1;
  })();

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
  const alcoholOther = rsvpForm && rsvpForm.querySelector(".alcohol-other");
  const alcoholOtherText = rsvpForm && rsvpForm.querySelector("#alcohol_other");
  const alcoholOtherWrap = rsvpForm && rsvpForm.querySelector("#alcohol-other-wrap");
  const alcoholGroup = rsvpForm && rsvpForm.querySelectorAll("input[name='alcohol']");
  const withPartnerEl = rsvpForm && rsvpForm.querySelector("#with_partner");
  const withPartnerLabel = rsvpForm && rsvpForm.querySelector("label[for='with_partner']");
  const stayOvernightEl = rsvpForm && rsvpForm.querySelector("#stay_overnight");
  const overnightPlusEl = rsvpForm && rsvpForm.querySelector("#overnight_plus1");
  const overnightPlusLabel = rsvpForm && rsvpForm.querySelector("label[for='overnight_plus1']");
  const attendingInputs = rsvpForm && rsvpForm.querySelectorAll("input[name='attending']");

  if (rsvpForm) {
    const attendCouple = document.getElementById("form-attend-couple");
    const overnightCouple = document.getElementById("form-overnight-couple");
    if (withCoupleMode) {
      if (attendCouple) attendCouple.removeAttribute("hidden");
      if (overnightCouple) overnightCouple.removeAttribute("hidden");
    } else {
      if (withPartnerEl) {
        withPartnerEl.checked = false;
        withPartnerEl.setAttribute("disabled", "disabled");
      }
      if (withPartnerLabel) withPartnerLabel.classList.add("is-disabled");
      if (overnightPlusEl) {
        overnightPlusEl.checked = false;
        overnightPlusEl.setAttribute("disabled", "disabled");
      }
      if (overnightPlusLabel) overnightPlusLabel.classList.add("is-disabled");
    }
  }

  function setOvernightPlusEnabled(on) {
    if (!withCoupleMode) {
      if (overnightPlusEl) {
        overnightPlusEl.checked = false;
        overnightPlusEl.setAttribute("disabled", "disabled");
        if (overnightPlusLabel) overnightPlusLabel.classList.add("is-disabled");
      }
      return;
    }
    if (!overnightPlusEl) return;
    if (on) {
      overnightPlusEl.removeAttribute("disabled");
      if (overnightPlusLabel) overnightPlusLabel.classList.remove("is-disabled");
    } else {
      overnightPlusEl.checked = false;
      overnightPlusEl.setAttribute("disabled", "disabled");
      if (overnightPlusLabel) overnightPlusLabel.classList.add("is-disabled");
    }
  }

  function setWithPartnerEnabled(attending) {
    if (!withCoupleMode) return;
    if (!withPartnerEl || !withPartnerLabel) return;
    if (attending) {
      withPartnerEl.removeAttribute("disabled");
      withPartnerLabel.classList.remove("is-disabled");
    } else {
      withPartnerEl.checked = false;
      withPartnerEl.setAttribute("disabled", "disabled");
      withPartnerLabel.classList.add("is-disabled");
    }
  }

  function syncAttendingPartnerUi() {
    if (!attendingInputs || !rsvpForm) return;
    const checked = rsvpForm.querySelector("input[name='attending']:checked");
    const isComing = Boolean(checked && checked.value === "true");
    setWithPartnerEnabled(isComing);
  }

  if (rsvpForm && stayOvernightEl) {
    setOvernightPlusEnabled(stayOvernightEl.checked);
    stayOvernightEl.addEventListener("change", function () {
      setOvernightPlusEnabled(stayOvernightEl.checked);
    });
  }
  if (rsvpForm && attendingInputs) {
    syncAttendingPartnerUi();
    attendingInputs.forEach(function (r) {
      r.addEventListener("change", syncAttendingPartnerUi);
    });
  }

  if (rsvpForm && rsvpSection) {
    function markRsvpFilling() {
      rsvpSection.classList.add("is-filling");
      rsvpForm.removeEventListener("input", markRsvpFilling);
      rsvpForm.removeEventListener("change", markRsvpFilling);
    }
    rsvpForm.addEventListener("input", markRsvpFilling);
    rsvpForm.addEventListener("change", markRsvpFilling);
  }

  function buildDringSuggestings(form) {
    var selected = Array.prototype.slice.call(form.querySelectorAll("input[name='alcohol']:checked"), 0);
    if (selected.length === 0) return "";
    if (selected.length === 1 && selected[0].value === "none") {
      return DRINK_LABELS.none;
    }
    var otherText =
      (form.querySelector("#alcohol_other") && form.querySelector("#alcohol_other").value.trim()) || "";
    var otherChecked = selected.some(function (x) {
      return x.value === "other";
    });
    var parts = selected
      .filter(function (x) {
        return x.value !== "none" && x.value !== "other";
      })
      .map(function (x) {
        return DRINK_LABELS[x.value] || x.value;
      });
    if (otherChecked) {
      if (otherText) {
        parts.push("другое: " + otherText);
      } else {
        parts.push("другое");
      }
    }
    return parts.join(", ");
  }

  function syncAlcoholOtherUi() {
    if (!alcoholOther || !alcoholOtherText || !alcoholOtherWrap) return;
    if (alcoholNo && alcoholNo.checked) {
      alcoholOtherText.value = "";
      alcoholOtherText.setAttribute("disabled", "disabled");
      alcoholOtherWrap.classList.add("is-disabled");
      alcoholOtherWrap.setAttribute("hidden", "hidden");
      return;
    }
    if (alcoholOther.checked) {
      alcoholOtherText.removeAttribute("disabled");
      alcoholOtherWrap.classList.remove("is-disabled");
      alcoholOtherWrap.removeAttribute("hidden");
    } else {
      alcoholOtherText.setAttribute("disabled", "disabled");
      alcoholOtherWrap.classList.add("is-disabled");
      alcoholOtherWrap.setAttribute("hidden", "hidden");
    }
  }

  /** @param {HTMLFormElement} form */
  function buildRsvpPayload(form) {
    const attending = form.querySelector("input[name='attending']:checked");
    const isAttending = Boolean(attending && attending.value === "true");
    const stay =
      form.querySelector("#stay_overnight") && form.querySelector("#stay_overnight").checked;
    const wp = withCoupleMode
      ? form.querySelector("#with_partner") &&
        !form.querySelector("#with_partner").disabled &&
        form.querySelector("#with_partner").checked
      : false;
    const op1 = withCoupleMode
      ? form.querySelector("#overnight_plus1") &&
        !form.querySelector("#overnight_plus1").disabled &&
        form.querySelector("#overnight_plus1").checked
      : false;
    var dring = buildDringSuggestings(form);
    if (dring.length > 2000) {
      dring = dring.slice(0, 2000);
    }
    return {
      full_name: (form.querySelector("#full_name") && form.querySelector("#full_name").value.trim()) || "",
      attending: isAttending,
      with_partner: Boolean(isAttending && wp),
      stay_overnight: Boolean(stay),
      overnight_plus1: Boolean(stay && op1),
      dring_suggestings: dring,
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
        syncAlcoholOtherUi();
      });
    });
    syncAlcoholOtherUi();
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
