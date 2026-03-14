const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const pad2 = (n) => String(n).padStart(2, "0");

const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseISODateLocal = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const humanDateRU = (d = new Date()) => {
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря"
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
};

const humanDateRUFull = (iso) => {
  if (!iso) return "";
  const [y, m, dd] = iso.split("-").map(Number);
  return `${pad2(dd)}.${pad2(m)}.${y}`;
};

const humanDateLong = (iso) => {
  const d = parseISODateLocal(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
};

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const HABITS_META = {
  water: { label: "💧 Вода", unit: "л", type: "decimal", defaultStep: 0.5, goal: 2 },
  sport: { label: "🏃 Спорт", unit: "мин", type: "int", defaultStep: 10, goal: 30 },
  reading: { label: "📚 Чтение", unit: "мин", type: "int", defaultStep: 15, goal: 30 },
  sleep: { label: "😴 Сон", unit: "ч", type: "decimal", defaultStep: 1, goal: 8 },
  walk: { label: "🚶 Прогулка", unit: "мин", type: "int", defaultStep: 20, goal: 60 }
};

const STORAGE_KEY = "forestPlannerDataV5";
const todayISO = isoDate();

let editingNoteId = null;
let toastTimer = null;

const defaultData = {
  version: 5,
  theme: "light",
  profile: {
    name: "Иван Петров",
    about: "",
    dob: "",
    avatarDataUrl: null
  },
  notes: [],
  habits: {},
  statsDayISO: todayISO,
  habitsDayISO: todayISO,
  dayNotes: {},
  periodDays: 7
};

let data = migrateData(store.get(STORAGE_KEY, defaultData));

function migrateData(raw) {
  const merged = {
    ...defaultData,
    ...raw,
    profile: { ...defaultData.profile, ...(raw?.profile || {}) },
    habits: raw?.habits || {},
    dayNotes: raw?.dayNotes || {},
    notes: Array.isArray(raw?.notes) ? raw.notes : []
  };

  if (!merged.statsDayISO) merged.statsDayISO = todayISO;
  if (!merged.habitsDayISO) merged.habitsDayISO = todayISO;
  if (![7, 14, 30].includes(Number(merged.periodDays))) merged.periodDays = 7;
  if (!["light", "dark"].includes(merged.theme)) merged.theme = "light";

  Object.keys(merged.habits).forEach((day) => {
    merged.habits[day] = {
      water: 0,
      sport: 0,
      reading: 0,
      sleep: 0,
      walk: 0,
      ...merged.habits[day]
    };
  });

  merged.notes = merged.notes.map((note) => ({
    ...note,
    dateISO: note.dateISO || todayISO
  }));

  return merged;
}

function saveData(msg) {
  store.set(STORAGE_KEY, data);
  if (msg) toast(msg);
}

function toast(msg = "Сохранено") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("toast--show"), 1200);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getHabitEntry(iso) {
  if (!data.habits[iso]) {
    data.habits[iso] = {
      water: 0,
      sport: 0,
      reading: 0,
      sleep: 0,
      walk: 0
    };
  }
  return data.habits[iso];
}

function getSelectedHabitsISO() {
  return data.habitsDayISO || todayISO;
}

function getSelectedStatsISO() {
  return data.statsDayISO || todayISO;
}

function formatHabitValue(key, value) {
  const meta = HABITS_META[key];
  const num = Number(value || 0);

  if (meta.type === "decimal") {
    return `${Number.isInteger(num) ? num : num.toFixed(1)} ${meta.unit}`;
  }

  return `${Math.round(num)} ${meta.unit}`;
}

function formatProgressValue(value, unit) {
  const num = Number(value || 0);
  const output = Number.isInteger(num) ? num : num.toFixed(1);
  return `${output} ${unit}`;
}

function textToListItems(text) {
  return String(text)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyTheme() {
  document.body.classList.toggle("theme-dark", data.theme === "dark");
  const icon = $("#themeToggleIcon");
  if (icon) icon.textContent = data.theme === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  data.theme = data.theme === "dark" ? "light" : "dark";
  applyTheme();
  saveData("Тема изменена");
}

function showScreen(name) {
  $$(".screen").forEach((s) => s.classList.remove("screen--active"));
  $(`#screen-${name}`)?.classList.add("screen--active");

  $$(".nav-item").forEach((b) => b.classList.remove("nav-item--active"));
  $(`.nav-item[data-go="${name}"]`)?.classList.add("nav-item--active");

  const title = $(`#screen-${name}`)?.dataset.title || "";
  $("#screenTitle").textContent = title;

  if (name === "profile") renderProfile();
  if (name === "notes") renderNotes();
  if (name === "habits") renderHabits();
  if (name === "stats") renderStats();
}

function renderProfile() {
  const p = data.profile;
  $("#profileNameTitle").textContent = p.name || "Профиль";
  $("#profileName").value = p.name || "";
  $("#profileAbout").value = p.about || "";
  $("#profileDob").value = p.dob || "";
  $("#avatarImg").src =
    p.avatarDataUrl || "https://placehold.co/96x96/png?text=%F0%9F%91%A4";
}

function renderNotes() {
  const list = $("#notesList");
  list.innerHTML = "";

  if (data.notes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card muted empty-card";
    empty.textContent = "Пока нет заметок. Добавьте первую 🙂";
    list.appendChild(empty);
    return;
  }

  data.notes.forEach((n) => {
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "note-card__head";

    const title = document.createElement("div");
    title.className = "note-card__title";
    title.textContent = n.title;

    const actions = document.createElement("div");
    actions.className = "note-card__actions";

    const edit = document.createElement("button");
    edit.className = "btn btn--outline";
    edit.style.padding = "8px 10px";
    edit.type = "button";
    edit.textContent = "✏️";
    edit.onclick = () => {
      editingNoteId = n.id;
      $("#noteTitle").value = n.title;
      $("#noteText").value = n.text;
      $("#btnAddNote").textContent = "Сохранить";
      showScreen("notes");
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast("Редактирование заметки");
    };

    const del = document.createElement("button");
    del.className = "btn btn--outline";
    del.style.padding = "8px 10px";
    del.type = "button";
    del.textContent = "✖";
    del.onclick = () => {
      data.notes = data.notes.filter((x) => x.id !== n.id);
      saveData("Заметка удалена");
      renderNotes();
      renderStats();
    };

    actions.append(edit, del);
    head.append(title, actions);

    const items = textToListItems(n.text);
    const listEl = document.createElement("ul");
    listEl.className = "note-card__list";

    items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it;
      listEl.appendChild(li);
    });

    const date = document.createElement("div");
    date.className = "note-card__date";
    date.textContent = humanDateRUFull(n.dateISO);

    card.append(head, listEl, date);
    list.appendChild(card);
  });
}

function renderHabits() {
  const selectedISO = getSelectedHabitsISO();
  const h = getHabitEntry(selectedISO);

  $("#habitsDayPicker").value = selectedISO;
  $("#habitsDate").textContent = humanDateLong(selectedISO);

  $("#val-water").textContent = formatHabitValue("water", h.water);
  $("#val-sport").textContent = formatHabitValue("sport", h.sport);
  $("#val-reading").textContent = formatHabitValue("reading", h.reading);
  $("#val-sleep").textContent = formatHabitValue("sleep", h.sleep);
  $("#val-walk").textContent = formatHabitValue("walk", h.walk);
}

function calcStreak() {
  let streak = 0;

  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);

    const habits = data.habits[iso];
    const hasHabits =
      !!habits &&
      Object.keys(HABITS_META).some((k) => Number(habits[k] || 0) > 0);

    const hasDayNotes =
      Array.isArray(data.dayNotes[iso]) && data.dayNotes[iso].length > 0;

    if (hasHabits || hasDayNotes) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function countCompletedGoalsForDay(iso) {
  const h = getHabitEntry(iso);
  return Object.entries(HABITS_META).reduce((acc, [key, meta]) => {
    return acc + (Number(h[key] || 0) >= meta.goal ? 1 : 0);
  }, 0);
}

function computeTotalsForSelectedDay() {
  const dayISO = getSelectedStatsISO();
  const h = getHabitEntry(dayISO);

  return {
    streak: calcStreak(),
    water: formatHabitValue("water", h.water),
    notes: `${(data.dayNotes[dayISO] || []).length}`,
    sport: formatHabitValue("sport", h.sport),
    reading: formatHabitValue("reading", h.reading),
    goals: `${countCompletedGoalsForDay(dayISO)}/5`
  };
}

function renderStatsCards() {
  const totals = computeTotalsForSelectedDay();
  const grid = $("#statsGrid");
  grid.innerHTML = "";

  [
    { val: totals.streak, lbl: "серия дней" },
    { val: totals.water, lbl: "вода за день" },
    { val: totals.notes, lbl: "заметок за день" },
    { val: totals.sport, lbl: "спорт за день" },
    { val: totals.reading, lbl: "чтение за день" },
    { val: totals.goals, lbl: "целей выполнено" }
  ].forEach((it) => {
    const el = document.createElement("div");
    el.className = "stat";
    el.innerHTML = `
      <div class="stat__val">${escapeHtml(it.val)}</div>
      <div class="stat__lbl">${escapeHtml(it.lbl)}</div>
    `;
    grid.appendChild(el);
  });
}

function buildWeekdays() {
  const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const row = $("#weekdayRow");
  row.innerHTML = "";

  const refDate = parseISODateLocal(getSelectedStatsISO());
  const day = (refDate.getDay() + 6) % 7;
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - day);

  const weekIsos = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekIsos.push(isoDate(d));
  }

  weekIsos.forEach((iso, idx) => {
    const pill = document.createElement("button");
    pill.className = "daypill" + (iso === data.statsDayISO ? " daypill--active" : "");
    pill.type = "button";
    pill.textContent = `${names[idx]} ${iso.slice(8)}`;
    pill.onclick = () => {
      data.statsDayISO = iso;
      $("#statsDatePicker").value = iso;
      saveData();
      renderStats();
    };
    row.appendChild(pill);
  });
}

function renderDayNotes() {
  const dayISO = getSelectedStatsISO();
  $("#dayNotesTitle").textContent = `Заметки за день ${humanDateRUFull(dayISO)}`;

  const list = $("#dayNotesList");
  list.innerHTML = "";
  const arr = data.dayNotes[dayISO] || [];

  if (arr.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Нет заметок за этот день.";
    list.appendChild(empty);
    return;
  }

  arr.forEach((n) => {
    const item = document.createElement("div");
    item.className = "day-note";
    item.innerHTML = `
      <button class="day-note__del" title="Удалить" type="button">✖</button>
      <div>${escapeHtml(n.text)}</div>
      <div class="day-note__date">${humanDateRUFull(n.dateISO)}</div>
    `;

    item.querySelector(".day-note__del").onclick = () => {
      data.dayNotes[dayISO] = (data.dayNotes[dayISO] || []).filter((x) => x.id !== n.id);
      saveData("Заметка удалена");
      renderStats();
    };

    list.appendChild(item);
  });
}

function getPeriodData(days) {
  const items = Object.keys(HABITS_META).map((key) => ({
    key,
    label: HABITS_META[key].label,
    unit: HABITS_META[key].unit,
    total: 0,
    maxPossible: HABITS_META[key].goal * days
  }));

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    const h = data.habits[iso] || {};

    items.forEach((item) => {
      item.total += Number(h[item.key] || 0);
    });
  }

  return items;
}

function renderProgress() {
  const days = Number(data.periodDays || 7);
  $("#periodSelect").value = String(days);

  const list = $("#progressList");
  list.innerHTML = "";

  const items = getPeriodData(days);

  items.forEach((item) => {
    const percent =
      item.maxPossible > 0
        ? Math.min(100, Math.round((item.total / item.maxPossible) * 100))
        : 0;

    const row = document.createElement("div");
    row.className = "progress-item";
    row.innerHTML = `
      <div class="progress-item__top">
        <div class="progress-item__name">${escapeHtml(item.label)}</div>
        <div class="progress-item__value">${escapeHtml(formatProgressValue(item.total, item.unit))}</div>
      </div>
      <div class="progress-track">
        <div class="progress-bar" style="width:${percent}%"></div>
      </div>
    `;
    list.appendChild(row);
  });
}

function renderStats() {
  $("#statsDatePicker").value = getSelectedStatsISO();
  renderStatsCards();
  buildWeekdays();
  renderProgress();
  renderDayNotes();
}

function addHabitValue(type) {
  const selectedISO = getSelectedHabitsISO();
  const h = getHabitEntry(selectedISO);

  const inputMap = {
    water: $("#inp-water"),
    sport: $("#inp-sport"),
    reading: $("#inp-reading"),
    sleep: $("#inp-sleep"),
    walk: $("#inp-walk")
  };

  const input = inputMap[type];
  const meta = HABITS_META[type];
  if (!input || !meta) return;

  let value = 0;

  if (meta.type === "decimal") {
    value = parseFloat(input.value.replace(",", "."));
    if (Number.isNaN(value) || value <= 0) value = meta.defaultStep;
    h[type] = +(Number(h[type] || 0) + value).toFixed(1);
  } else {
    value = parseInt(input.value, 10);
    if (Number.isNaN(value) || value <= 0) value = meta.defaultStep;
    h[type] = Number(h[type] || 0) + value;
  }

  input.value = "";
  saveData("Добавлено");
  renderHabits();
  renderStats();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/public/sw.js").catch((err) => {
        console.error("SW registration failed:", err);
      });
    });
  }
}

function setupEvents() {
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.go));
  });

  $("#themeToggle").addEventListener("click", toggleTheme);

  $("#btnChangePhoto").addEventListener("click", () => $("#avatarInput").click());

  $("#avatarInput").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      data.profile.avatarDataUrl = reader.result;
      $("#avatarImg").src = reader.result;
      saveData("Фото обновлено");
    };
    reader.readAsDataURL(file);
  });

  $("#btnSaveProfile").addEventListener("click", () => {
    data.profile.name = $("#profileName").value.trim() || "Без имени";
    data.profile.about = $("#profileAbout").value.trim();
    data.profile.dob = $("#profileDob").value;
    $("#profileNameTitle").textContent = data.profile.name;
    saveData("Профиль сохранён");
  });

  $("#btnAddNote").addEventListener("click", () => {
    const title = $("#noteTitle").value.trim();
    const text = $("#noteText").value.trim();

    if (!title || !text) {
      toast("Заполните заголовок и текст");
      return;
    }

    if (editingNoteId) {
      const note = data.notes.find((x) => x.id === editingNoteId);
      if (note) {
        note.title = title;
        note.text = text;
      }
      editingNoteId = null;
      $("#btnAddNote").textContent = "Добавить заметку";
      toast("Заметка обновлена");
    } else {
      data.notes.unshift({
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        title,
        text,
        dateISO: isoDate(new Date())
      });
      toast("Заметка добавлена");
    }

    $("#noteTitle").value = "";
    $("#noteText").value = "";
    saveData();
    renderNotes();
    renderStats();
  });

  $$(".btn--plus").forEach((btn) => {
    btn.addEventListener("click", () => addHabitValue(btn.dataset.add));
  });

  $("#btnSaveProgress").addEventListener("click", () => {
    saveData("Прогресс сохранён");
  });

  $("#habitsDayPicker").addEventListener("change", (e) => {
    data.habitsDayISO = e.target.value || todayISO;
    saveData();
    renderHabits();
  });

  $("#statsDatePicker").addEventListener("change", (e) => {
    data.statsDayISO = e.target.value || todayISO;
    saveData();
    renderStats();
  });

  $("#periodSelect").addEventListener("change", (e) => {
    data.periodDays = Number(e.target.value || 7);
    saveData();
    renderProgress();
  });

  $("#btnAddDayNote").addEventListener("click", () => {
    const dayISO = getSelectedStatsISO();
    const text = $("#dayNoteText").value.trim();

    if (!text) {
      toast("Введите текст заметки");
      return;
    }

    if (!data.dayNotes[dayISO]) data.dayNotes[dayISO] = [];

    data.dayNotes[dayISO].unshift({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()),
      text,
      dateISO: dayISO
    });

    $("#dayNoteText").value = "";
    saveData("Заметка добавлена");
    renderStats();
  });
}

function init() {
  $("#topDate").textContent = humanDateRU();
  applyTheme();
  setupEvents();
  renderProfile();
  renderNotes();
  renderHabits();
  renderStats();
  showScreen("profile");
  registerServiceWorker();
}

init();