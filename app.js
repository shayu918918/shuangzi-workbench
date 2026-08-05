const STORAGE_KEY = "personal-workbench-v2";
const LEGACY_STORAGE_KEY = "personal-workbench-v1";
const tagOptions = ["生活", "情绪", "阅读", "写作", "论文灵感", "待深想"];
const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const arrayStateKeys = ["tasks", "notes", "schedule", "focusSessions", "exerciseSessions", "habits"];
const habitAccentCycle = ["green", "blue", "peach", "purple", "sage", "rose", "berry"];
const defaultHabits = [
  { id: "habit-reading", title: "阅读", accent: "green", doneDates: [] },
  { id: "habit-writing", title: "写作", accent: "blue", doneDates: [] },
  { id: "habit-exercise", title: "运动", accent: "peach", doneDates: [] },
  { id: "habit-sleep-early", title: "早睡", accent: "purple", doneDates: [] },
  { id: "habit-discipline", title: "自律", accent: "berry", doneDates: [] }
];
const pinnedHabitSeedVersion = 4;
const pinnedHabits = [
  { id: "habit-sleep-early", title: "早睡", accent: "purple", doneDates: [] },
  { id: "habit-discipline", title: "自律", accent: "berry", doneDates: [] }
];

const state = loadState();
seedPinnedHabits();
const selectedTags = new Set(["生活"]);
let focusTimer = createTimerState();
let exerciseTimer = createTimerState();
let exerciseSteps = [];
let audioContext;
let toastTimer;
let deferredInstallPrompt;

function createTimerState() {
  return {
    total: 0,
    remaining: 0,
    running: false,
    interval: null,
    startedAt: null,
    stepIndex: 0
  };
}

function loadState() {
  const defaults = {
    tasks: [],
    notes: [],
    schedule: [],
    focusSessions: [],
    exerciseSessions: [],
    habits: defaultHabits.map((habit) => ({ ...habit, doneDates: [] })),
    settings: {
      fontScale: "normal",
      soundMode: "strong",
      interactionSound: "soft",
      homeOrder: "schedule-tasks-habits",
      exerciseGoalMinutes: 30,
      hiddenHomeModules: []
    }
  };
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const saved = JSON.parse(raw);
    const next = { ...defaults };
    arrayStateKeys.forEach((key) => {
      if (Array.isArray(saved[key])) next[key] = saved[key];
    });
    if (saved.settings && typeof saved.settings === "object") {
      next.settings = { ...defaults.settings, ...saved.settings };
    }
    return next;
  } catch {
    return defaults;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeExerciseGoal(value) {
  return Math.min(180, Math.max(5, Number(value) || 30));
}

function exerciseGoalMinutes() {
  return normalizeExerciseGoal(state.settings?.exerciseGoalMinutes);
}

function nextHabitAccent(title = "") {
  const recommended = recommendHabitAccent(title);
  const usedCount = state.habits.filter((habit) => habit.accent === recommended).length;
  if (usedCount === 0) return recommended;
  return habitAccentCycle
    .map((accent) => ({
      accent,
      count: state.habits.filter((habit) => habit.accent === accent).length
    }))
    .sort((a, b) => a.count - b.count)[0].accent;
}

function recommendHabitAccent(title) {
  if (/早睡|睡眠|晚安|睡觉/.test(title)) return "purple";
  if (/英语|英文|外语|单词|背词|English/i.test(title)) return "sage";
  if (/自律|坚持|克制|规律/.test(title)) return "berry";
  if (/读|阅读|书/.test(title)) return "green";
  if (/运动|健身|跑|练/.test(title)) return "peach";
  if (/写|论文/.test(title)) return "blue";
  if (/水|喝/.test(title)) return "rose";
  return habitAccentCycle[state.habits.length % habitAccentCycle.length];
}

function seedPinnedHabits() {
  if ((state.settings?.habitSeedVersion || 0) >= pinnedHabitSeedVersion) return;
  const existingTitles = new Set(state.habits.map((habit) => habit.title.trim()));
  pinnedHabits.forEach((habit) => {
    if (!existingTitles.has(habit.title)) {
      state.habits.push({ ...habit, doneDates: [] });
    }
  });
  state.habits.forEach((habit) => {
    if (/早睡|睡眠|晚安|睡觉/.test(habit.title)) habit.accent = "purple";
    if (/自律|坚持|克制|规律/.test(habit.title)) habit.accent = "berry";
  });
  state.settings = { ...(state.settings || {}), habitSeedVersion: pinnedHabitSeedVersion };
  saveState();
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  return dateToISO(new Date());
}

function dateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateToISO(date);
}

function eachDate(start, end) {
  const dates = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function formatDateTime(value) {
  const date = new Date(value);
  return `${dateToISO(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTaskDate(dateValue) {
  const target = new Date(`${dateValue}T00:00:00`);
  const today = new Date(`${todayISO()}T00:00:00`);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  return `${dateValue} ${weekNames[target.getDay()]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function chineseNumberToInt(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  if (value === "十") return 10;
  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const before = value.slice(0, tenIndex);
    const after = value.slice(tenIndex + 1);
    const tens = before ? digits[before] : 1;
    const ones = after ? digits[after] : 0;
    return tens * 10 + ones;
  }
  return [...value].reduce((sum, char) => sum * 10 + (digits[char] ?? 0), 0);
}

function setValidDate(date, year, month, day, rollForward = false) {
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return false;
  date.setFullYear(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  if (rollForward) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) date.setFullYear(year + 1, month - 1, day);
  }
  return true;
}

function parseChineseDate(text) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/大后天/.test(text)) {
    date.setDate(date.getDate() + 3);
  } else if (/后天/.test(text)) {
    date.setDate(date.getDate() + 2);
  } else if (/明天|明日/.test(text)) {
    date.setDate(date.getDate() + 1);
  } else {
    const numberUnit = "[一二两三四五六七八九十〇零\\d]{1,3}";
    const fullDate = text.match(new RegExp(`(20\\d{2})年\\s*(${numberUnit})月\\s*(${numberUnit})(?:日|号)?`));
    const fullNumericDate = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
    const monthDay = text.match(new RegExp(`(${numberUnit})月\\s*(${numberUnit})(?:日|号)?`));
    const nextMonthDay = text.match(new RegExp(`下个月\\s*(${numberUnit})(?:日|号)?`));
    const dottedMonthDay = text.match(/(?:^|[^\d])(\d{1,2})[.\/](\d{1,2})(?:日|号)?(?=$|[^\d])/);
    const iso = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (fullDate && setValidDate(date, Number(fullDate[1]), chineseNumberToInt(fullDate[2]), chineseNumberToInt(fullDate[3]))) {
      return dateToISO(date);
    } else if (fullNumericDate && setValidDate(date, Number(fullNumericDate[1]), Number(fullNumericDate[2]), Number(fullNumericDate[3]))) {
      return dateToISO(date);
    } else if (nextMonthDay) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      setValidDate(date, nextMonth.getFullYear(), nextMonth.getMonth() + 1, chineseNumberToInt(nextMonthDay[1]));
    } else if (monthDay) {
      setValidDate(date, now.getFullYear(), chineseNumberToInt(monthDay[1]), chineseNumberToInt(monthDay[2]), true);
    } else if (dottedMonthDay) {
      setValidDate(date, now.getFullYear(), Number(dottedMonthDay[1]), Number(dottedMonthDay[2]), true);
    } else if (iso) {
      date.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    } else {
      const weekMatch = text.match(/(下周|下星期|本周|这周|每周|每星期|周|星期)([一二三四五六日天])/);
      if (weekMatch) {
        const target = "日一二三四五六天".indexOf(weekMatch[2]);
        const normalized = target === 7 ? 0 : target;
        let diff = (normalized - date.getDay() + 7) % 7;
        if (/下周|下星期/.test(weekMatch[1])) diff += 7;
        if (!/本周|这周/.test(weekMatch[1]) && diff === 0) diff = 7;
        date.setDate(date.getDate() + diff);
      }
    }
  }
  return dateToISO(date);
}

function parseChineseTime(text) {
  const classMatch = text.match(/(上午|下午|晚上)?第([一二三四五六七八九十\d]+)节/);
  if (classMatch) {
    const index = chineseNumberToInt(classMatch[2]);
    const period = classMatch[1] || "上午";
    const morning = ["08:00", "10:00", "11:00", "12:00"];
    const afternoon = ["14:00", "16:00", "18:00"];
    const evening = ["19:00", "20:00", "21:00"];
    const table = period === "下午" ? afternoon : period === "晚上" ? evening : morning;
    return table[Math.max(0, Math.min(table.length - 1, index - 1))] || "";
  }
  const match = text.match(/(凌晨|早上|上午|中午|下午|晚上|今晚)?\s*(\d{1,2})(?::|点|：)(\d{1,2})?分?/);
  if (!match) return "";
  let hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  const period = match[1] || "";
  if ((period === "下午" || period === "晚上" || period === "今晚") && hour < 12) hour += 12;
  if (period === "中午" && hour < 11) hour += 12;
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function classifyTask(text) {
  if (/上课|课程|讲课|课堂|课表|教室/.test(text)) return "课程";
  if (/读|阅读|文献|书|摘录/.test(text)) return "阅读";
  if (/写|论文|投稿|修改|初稿|二稿|定稿/.test(text)) return "写作";
  if (/运动|健身|拉伸|瑜伽|训练/.test(text)) return "运动";
  if (/开会|会议|讲座|汇报/.test(text)) return "会议";
  return "待办";
}

function parseRepeat(text) {
  if (/每天|每日/.test(text)) return "daily";
  if (/每周|每星期/.test(text)) return "weekly";
  if (/每月/.test(text)) return "monthly";
  return "none";
}

function cleanTaskTitle(text) {
  const numberUnit = "[一二两三四五六七八九十〇零\\d]{1,3}";
  let title = text
    .replace(new RegExp(`20\\d{2}年\\s*${numberUnit}月\\s*${numberUnit}(?:日|号)?`, "g"), "")
    .replace(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g, "")
    .replace(new RegExp(`下个月\\s*${numberUnit}(?:日|号)?`, "g"), "")
    .replace(new RegExp(`${numberUnit}月\\s*${numberUnit}(?:日|号)?`, "g"), "")
    .replace(/(^|[^\d])\d{1,2}[.\/]\d{1,2}(?:日|号)?(?=$|[^\d])/g, "$1")
    .replace(/大后天|后天|明天|明日|今天|今日|今晚/g, "")
    .replace(/(下周|下星期|本周|这周|每周|每星期|周|星期)[一二三四五六日天]+/g, "")
    .replace(/每[天日月]/g, "")
    .replace(/(凌晨|早上|上午|中午|下午|晚上)?\s*\d{1,2}(?::|点|：)\d{0,2}分?/g, "")
    .replace(/(上午|下午|晚上|早上)?第[一二三四五六七八九十\d]+节/g, "")
    .replace(/^前|前$/g, "")
    .replace(/[，,；;。]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return title || text.trim();
}

function parseTask(text) {
  const originalText = text.trim();
  return {
    id: uid("task"),
    title: cleanTaskTitle(originalText),
    rawTitle: originalText,
    date: parseChineseDate(originalText),
    time: parseChineseTime(originalText),
    category: classifyTask(originalText),
    repeat: parseRepeat(originalText),
    doneDates: [],
    focusLogs: [],
    createdAt: new Date().toISOString()
  };
}

function taskOccursOn(task, date = todayISO()) {
  if (task.date === date) return true;
  const target = new Date(`${date}T00:00:00`);
  const start = new Date(`${task.date}T00:00:00`);
  if (task.repeat === "daily" && start <= target) return true;
  if (task.repeat === "weekly" && start <= target && start.getDay() === target.getDay()) return true;
  if (task.repeat === "monthly" && start <= target && start.getDate() === target.getDate()) return true;
  return false;
}

function isDoneOn(task, date = todayISO()) {
  return task.doneDates.includes(date);
}

function init() {
  applySettings();
  document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());

  setupNavigation();
  setupTags();
  setupForms();
  setupStatsControls();
  setupTimers();
  setupPWA();
  renderAll();
  setView(viewFromHash());
  window.addEventListener("hashchange", () => setView(viewFromHash()));
}

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      playUiSound("nav");
      setView(button.dataset.view);
      history.replaceState(null, "", `#${button.dataset.view}`);
    });
  });
  document.querySelectorAll("[data-view-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      playUiSound("nav");
      setView(button.dataset.viewJump);
      history.replaceState(null, "", `#${button.dataset.viewJump}`);
    });
  });
  document.querySelectorAll("[data-dashboard-jump]").forEach((card) => {
    const activate = () => {
      playUiSound("nav");
      jumpFromDashboard(card.dataset.dashboardJump);
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });
  });
}

function setView(view) {
  const nextView = ["home", "timer", "schedule", "stats", "settings"].includes(view) ? view : "home";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === nextView));
  document.querySelectorAll(".section").forEach((section) => section.classList.toggle("active", section.id === `view-${nextView}`));
}

function viewFromHash() {
  const value = location.hash.replace("#", "");
  return value === "today" ? "home" : value || "home";
}

function jumpFromDashboard(target) {
  if (target === "schedule") {
    setView("schedule");
    history.replaceState(null, "", "#schedule");
    document.getElementById("view-schedule")?.scrollIntoView({ block: "start" });
    return;
  }
  if (target === "exercise") {
    setView("timer");
    history.replaceState(null, "", "#timer");
    switchTimer("exercise");
    document.getElementById("view-timer")?.scrollIntoView({ block: "start" });
    return;
  }
  if (target === "habits") {
    setView("home");
    history.replaceState(null, "", "#home");
    document.getElementById("homeHabitsModule")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function setupTags() {
  const tagBox = document.getElementById("tagChips");
  if (!tagBox) return;
  tagOptions.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${selectedTags.has(tag) ? " active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      if (selectedTags.has(tag)) selectedTags.delete(tag);
      else selectedTags.add(tag);
      button.classList.toggle("active");
      playUiSound("toggle");
    });
    tagBox.append(button);
  });

  document.getElementById("addTagButton")?.addEventListener("click", () => {
    const input = document.getElementById("customTagInput");
    const tag = input.value.trim();
    if (!tag) {
      playUiSound("error");
      return;
    }
    selectedTags.add(tag);
    input.value = "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip active";
    button.textContent = tag;
    button.addEventListener("click", () => {
      selectedTags.delete(tag);
      playUiSound("toggle");
      button.remove();
    });
    tagBox.append(button);
    playUiSound("save");
  });
}

function setupForms() {
  document.getElementById("quickTaskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("quickTaskInput");
    const text = input.value.trim();
    if (!text) {
      playUiSound("error");
      return;
    }
    const task = parseTask(text);
    state.tasks.unshift(task);
    input.value = "";
    saveState();
    renderAll();
    showTaskToast(`已加入：${formatTaskDate(task.date)}${task.time ? ` ${task.time}` : ""}`);
    playUiSound("save");
  });

  document.getElementById("noteForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const textarea = document.getElementById("noteText");
    const text = textarea.value.trim();
    if (!text) {
      playUiSound("error");
      return;
    }
    state.notes.unshift({
      id: uid("note"),
      text,
      tags: [...selectedTags],
      createdAt: new Date().toISOString()
    });
    textarea.value = "";
    saveState();
    renderNotes();
    playUiSound("save");
  });

  document.getElementById("scheduleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = document.getElementById("scheduleTitle").value.trim();
    if (!title) {
      playUiSound("error");
      return;
    }
    state.schedule.push({
      id: uid("class"),
      day: Number(document.getElementById("scheduleDay").value),
      time: document.getElementById("scheduleTime").value,
      title
    });
    document.getElementById("scheduleTitle").value = "";
    saveState();
    renderAll();
    playUiSound("save");
  });

  document.getElementById("appSettingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings.fontScale = document.getElementById("fontScale").value;
    state.settings.soundMode = document.getElementById("soundMode").value;
    state.settings.interactionSound = document.getElementById("interactionSound").value;
    state.settings.homeOrder = document.getElementById("homeOrder").value;
    state.settings.exerciseGoalMinutes = normalizeExerciseGoal(document.getElementById("exerciseGoalMinutes").value);
    state.settings.hiddenHomeModules = ["schedule", "tasks", "habits"].filter((module) => !document.getElementById(`showHome${capitalize(module)}`).checked);
    saveState();
    applySettings();
    renderHome();
    playUiSound("save");
  });

  document.getElementById("habitForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const titleInput = document.getElementById("habitTitle");
    const title = titleInput.value.trim();
    if (!title) {
      playUiSound("error");
      return;
    }
    state.habits.push({
      id: uid("habit"),
      title,
      accent: nextHabitAccent(title),
      doneDates: []
    });
    titleInput.value = "";
    saveState();
    renderHabits();
    playUiSound("save");
  });

  document.getElementById("exportNotesButton")?.addEventListener("click", () => {
    playUiSound("export");
    downloadText("个人感想.md", notesToMarkdown());
  });
  document.getElementById("exportDailyButton").addEventListener("click", () => {
    const today = todayISO();
    playUiSound("export");
    downloadText(`个人工作台日报-${today}.md`, reportToMarkdown(today, today, "日报"));
  });
  document.getElementById("exportWeeklyButton").addEventListener("click", () => {
    const end = todayISO();
    const start = addDays(end, -6);
    playUiSound("export");
    downloadText(`个人工作台周报-${start}_${end}.md`, reportToMarkdown(start, end, "周报"));
  });
  document.getElementById("exportBackupButton").addEventListener("click", () => {
    playUiSound("export");
    exportBackup();
  });
  document.getElementById("importBackupInput").addEventListener("change", importBackup);
}

function setupStatsControls() {
  const start = document.getElementById("statsStart");
  const end = document.getElementById("statsEnd");
  const range = document.getElementById("statsRange");
  const today = todayISO();
  const weekAgo = addDays(today, -6);
  start.value = weekAgo;
  end.value = today;
  range.addEventListener("change", renderStats);
  start.addEventListener("change", renderStats);
  end.addEventListener("change", renderStats);
}

function applySettings() {
  const fontScale = state.settings?.fontScale || "normal";
  const soundMode = state.settings?.soundMode || "strong";
  const interactionSound = state.settings?.interactionSound || "soft";
  const goalMinutes = exerciseGoalMinutes();
  let homeOrder = state.settings?.homeOrder || "schedule-tasks-habits";
  if (homeOrder === "schedule-habits-tasks") {
    homeOrder = "schedule-tasks-habits";
    state.settings.homeOrder = homeOrder;
    saveState();
  }
  document.documentElement.dataset.fontScale = fontScale;
  document.getElementById("fontScale").value = fontScale;
  document.getElementById("soundMode").value = soundMode;
  document.getElementById("interactionSound").value = interactionSound;
  document.getElementById("exerciseGoalMinutes").value = goalMinutes;
  document.getElementById("homeOrder").value = homeOrder;
  ["schedule", "tasks", "habits"].forEach((module) => {
    document.getElementById(`showHome${capitalize(module)}`).checked = !state.settings?.hiddenHomeModules?.includes(module);
  });
  applyHomeOrder(homeOrder);
  applyHomeVisibility();
}

function applyHomeOrder(orderValue = "schedule-tasks-habits") {
  const order = orderValue.split("-");
  document.querySelectorAll("[data-home-module]").forEach((module) => {
    const index = order.indexOf(module.dataset.homeModule);
    module.style.order = String(index >= 0 ? index + 1 : 10);
  });
}

function applyHomeVisibility() {
  const hidden = new Set(state.settings?.hiddenHomeModules || []);
  document.querySelectorAll("[data-home-module]").forEach((module) => {
    module.hidden = hidden.has(module.dataset.homeModule);
  });
}

function showTaskToast(message) {
  const toast = document.getElementById("taskToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function setupTimers() {
  document.getElementById("focusTab").addEventListener("click", () => {
    playUiSound("nav");
    switchTimer("focus");
  });
  document.getElementById("exerciseTab").addEventListener("click", () => {
    playUiSound("nav");
    switchTimer("exercise");
  });
  document.getElementById("focusMinutes").addEventListener("input", resetFocus);
  document.getElementById("focusStart").addEventListener("click", () => {
    playUiSound("save");
    startFocus();
  });
  document.getElementById("focusPause").addEventListener("click", () => {
    playUiSound("toggle");
    pauseFocus();
  });
  document.getElementById("focusReset").addEventListener("click", () => {
    playUiSound("delete");
    resetFocus();
  });
  document.getElementById("exerciseStart").addEventListener("click", () => {
    playUiSound("save");
    startExercise();
  });
  document.getElementById("exercisePause").addEventListener("click", () => {
    playUiSound("toggle");
    pauseExercise();
  });
  document.getElementById("exerciseReset").addEventListener("click", () => {
    playUiSound("delete");
    resetExercise();
  });
  ["warmupSeconds", "leftSeconds", "switchSeconds", "rightSeconds", "restSeconds", "exerciseRounds"].forEach((id) => {
    document.getElementById(id).addEventListener("input", resetExercise);
  });
  resetFocus();
  resetExercise();
}

function setupPWA() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const button = document.getElementById("installAppButton");
    if (button) button.disabled = false;
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  document.getElementById("installAppButton")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      alert("如果浏览器支持安装，请在浏览器菜单中选择“添加到主屏幕”。");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
  });
  document.getElementById("refreshAppButton")?.addEventListener("click", async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("personal-workbench")).map((key) => caches.delete(key)));
    }
    location.reload();
  });
}

function switchTimer(mode) {
  const isFocus = mode === "focus";
  document.getElementById("focusPanel").classList.toggle("active", isFocus);
  document.getElementById("exercisePanel").classList.toggle("active", !isFocus);
  document.getElementById("focusTab").classList.toggle("active", isFocus);
  document.getElementById("exerciseTab").classList.toggle("active", !isFocus);
  document.getElementById("focusTab").setAttribute("aria-selected", String(isFocus));
  document.getElementById("exerciseTab").setAttribute("aria-selected", String(!isFocus));
}

function initAudio() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function beep(frequency = 740, duration = 0.16, volume = 0.28, delay = 0) {
  initAudio();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startAt = audioContext.currentTime + delay;
  oscillator.frequency.value = frequency;
  oscillator.type = "triangle";
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

function playUiSound(kind = "tap") {
  if (kind === "habit-success") playHabitSuccessSound();
}

function playHabitSuccessSound() {
  const mode = state.settings?.interactionSound || "soft";
  if (mode === "silent") return;
  if (!window.AudioContext && !window.webkitAudioContext) return;
  initAudio();
  const startAt = audioContext.currentTime;
  const volume = mode === "bright" ? 0.11 : 0.075;
  const notes = mode === "bright"
    ? [
        { frequency: 523.25, delay: 0, duration: 0.22 },
        { frequency: 659.25, delay: 0.055, duration: 0.24 },
        { frequency: 783.99, delay: 0.11, duration: 0.28 },
        { frequency: 1046.5, delay: 0.2, duration: 0.34 }
      ]
    : [
        { frequency: 523.25, delay: 0, duration: 0.24 },
        { frequency: 659.25, delay: 0.07, duration: 0.26 },
        { frequency: 783.99, delay: 0.15, duration: 0.32 }
      ];
  notes.forEach(({ frequency, delay, duration }, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const noteStart = startAt + delay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(volume * (1 - index * 0.08), noteStart + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + duration + 0.02);
  });
}

function playExerciseCue(kind = "stage", tone = 740) {
  const mode = state.settings?.soundMode || "strong";
  if (mode === "silent") return;
  if (mode === "soft") {
    beep(tone, 0.2, 0.26);
    return;
  }
  const pattern = kind === "finish"
    ? [880, 1040, 1220, 1040]
    : [tone, tone + 120, tone];
  pattern.forEach((frequency, index) => {
    beep(frequency, 0.18, 0.42, index * 0.22);
  });
  if ("vibrate" in navigator) {
    navigator.vibrate(kind === "finish" ? [180, 80, 180, 80, 260] : [140, 70, 140]);
  }
}

function formatSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function resetFocus() {
  clearInterval(focusTimer.interval);
  const minutes = Math.max(1, Number(document.getElementById("focusMinutes").value || 25));
  focusTimer = createTimerState();
  focusTimer.total = minutes * 60;
  focusTimer.remaining = focusTimer.total;
  document.getElementById("focusClock").textContent = formatSeconds(focusTimer.remaining);
}

function startFocus() {
  initAudio();
  if (focusTimer.running) return;
  setTimerNote("focusTimerNote", "");
  focusTimer.running = true;
  focusTimer.startedAt ||= new Date().toISOString();
  focusTimer.interval = setInterval(() => {
    focusTimer.remaining -= 1;
    document.getElementById("focusClock").textContent = formatSeconds(Math.max(0, focusTimer.remaining));
    if (focusTimer.remaining <= 0) {
      clearInterval(focusTimer.interval);
      focusTimer.running = false;
      beep(880, 0.28);
      const taskId = document.getElementById("focusTaskSelect").value;
      const boundTask = state.tasks.find((task) => task.id === taskId);
      const sessionId = uid("focus");
      const minutes = Math.max(1, Math.round(focusTimer.total / 60));
      const title = document.getElementById("focusTitle").value.trim() || boundTask?.title || "专注";
      state.focusSessions.unshift({
        id: sessionId,
        title,
        taskId: boundTask?.id || "",
        seconds: focusTimer.total,
        minutes,
        createdAt: new Date().toISOString()
      });
      if (boundTask) {
        boundTask.focusLogs ||= [];
        boundTask.focusLogs.push({
          id: sessionId,
          date: todayISO(),
          minutes,
          createdAt: new Date().toISOString()
        });
      }
      saveState();
      renderHome();
      renderFocusTaskOptions();
      renderStats();
      setTimerNote("focusTimerNote", boundTask ? `已为「${boundTask.title}」记录 ${minutes} 分钟专注。` : `已记录 ${minutes} 分钟专注。`);
      resetFocus();
    }
  }, 1000);
}

function pauseFocus() {
  clearInterval(focusTimer.interval);
  focusTimer.running = false;
}

function buildExerciseSteps() {
  const rounds = Math.max(1, Number(document.getElementById("exerciseRounds").value || 1));
  const base = [
    ["准备", "warmupSeconds", 620],
    ["左边", "leftSeconds", 760],
    ["换边准备", "switchSeconds", 620],
    ["右边", "rightSeconds", 760],
    ["休息", "restSeconds", 520]
  ];
  const steps = [];
  for (let round = 1; round <= rounds; round += 1) {
    base.forEach(([title, inputId, tone]) => {
      steps.push({
        title: `${title} ${round}/${rounds}`,
        seconds: Math.max(1, Number(document.getElementById(inputId).value || 1)),
        tone
      });
    });
  }
  return steps;
}

function resetExercise() {
  clearInterval(exerciseTimer.interval);
  exerciseSteps = buildExerciseSteps();
  exerciseTimer = createTimerState();
  exerciseTimer.remaining = exerciseSteps[0]?.seconds || 10;
  exerciseTimer.total = exerciseSteps.reduce((sum, step) => sum + step.seconds, 0);
  document.getElementById("exerciseStage").textContent = exerciseSteps[0]?.title || "准备";
  document.getElementById("exerciseClock").textContent = formatSeconds(exerciseTimer.remaining);
}

function startExercise() {
  initAudio();
  if (exerciseTimer.running) return;
  setTimerNote("exerciseTimerNote", "");
  exerciseTimer.running = true;
  exerciseTimer.startedAt ||= new Date().toISOString();
  playExerciseCue("stage", exerciseSteps[exerciseTimer.stepIndex]?.tone || 700);
  exerciseTimer.interval = setInterval(() => {
    exerciseTimer.remaining -= 1;
    document.getElementById("exerciseClock").textContent = formatSeconds(Math.max(0, exerciseTimer.remaining));
    if (exerciseTimer.remaining <= 0) {
      exerciseTimer.stepIndex += 1;
      if (exerciseTimer.stepIndex >= exerciseSteps.length) {
        clearInterval(exerciseTimer.interval);
        exerciseTimer.running = false;
        playExerciseCue("finish", 920);
        state.exerciseSessions.unshift({
          id: uid("exercise"),
          title: "居家运动",
          seconds: exerciseTimer.total,
          minutes: Math.max(1, Math.round(exerciseTimer.total / 60)),
          createdAt: new Date().toISOString()
        });
        const completedHabit = completeHabitByTitle(/运动|健身|跑|练/);
        saveState();
        renderHome();
        renderHabits();
        renderStats();
        setTimerNote("exerciseTimerNote", completedHabit ? "已记录运动时长，并自动完成今日运动打卡。" : "已记录运动时长。");
        resetExercise();
        return;
      }
      const step = exerciseSteps[exerciseTimer.stepIndex];
      exerciseTimer.remaining = step.seconds;
      document.getElementById("exerciseStage").textContent = step.title;
      document.getElementById("exerciseClock").textContent = formatSeconds(step.seconds);
      playExerciseCue("stage", step.tone);
    }
  }, 1000);
}

function pauseExercise() {
  clearInterval(exerciseTimer.interval);
  exerciseTimer.running = false;
}

function setTimerNote(id, message) {
  const note = document.getElementById(id);
  if (!note) return;
  note.textContent = message;
  note.classList.toggle("show", Boolean(message));
}

function completeHabitByTitle(pattern) {
  const habit = state.habits.find((item) => pattern.test(item.title));
  if (!habit) return false;
  const today = todayISO();
  habit.doneDates ||= [];
  if (habit.doneDates.includes(today)) return false;
  habit.doneDates.push(today);
  return true;
}

function renderAll() {
  renderHome();
  renderHabits();
  renderNotes();
  renderSchedule();
  renderFocusTaskOptions();
  renderStats();
}

function renderHome() {
  const today = todayISO();
  const todayList = document.getElementById("todayList");
  const allTaskList = document.getElementById("allTaskList");
  const dashboardTaskList = document.getElementById("dashboardTaskPreview");
  const todayScheduleList = document.getElementById("todayScheduleList");
  const todayScheduleItems = getTodayScheduleItems();
  const weekScheduleItems = getWeekScheduleItems();
  const todayTasks = state.tasks.filter((task) => taskOccursOn(task, today));
  const allTasks = state.tasks.slice().sort(sortTasks);
  const remainingTodayTasks = todayTasks.filter((task) => !isDoneOn(task, today));
  const sortedTodayTasks = remainingTodayTasks.slice().sort(sortTasks);
  const doneCount = todayTasks.filter((task) => isDoneOn(task, today)).length;

  document.getElementById("todayTaskCount").textContent = `${remainingTodayTasks.length} 项`;
  document.getElementById("todayScheduleCount").textContent = `${weekScheduleItems.length} 节`;
  document.getElementById("allTaskCount").textContent = `${allTasks.length} 项`;
  renderDashboardPreview(todayScheduleItems, sortedTodayTasks, doneCount, todayTasks.length);

  todayScheduleList.innerHTML = weekScheduleItems.length
    ? weekScheduleItems.map((item) => renderWeekScheduleItem(item)).join("")
    : `<div class="empty empty-compact">本周无课表</div>`;

  todayList.innerHTML = sortedTodayTasks.length
    ? sortedTodayTasks.map((item) => renderTaskItem(item, today)).join("")
    : `<div class="empty empty-compact">暂无待办</div>`;

  allTaskList.innerHTML = allTasks.length
    ? allTasks.map((item) => renderTaskItem(item, item.date)).join("")
    : `<div class="empty empty-compact">暂无未来清单</div>`;

  bindTaskButtons(todayList);
  bindTaskButtons(allTaskList);
  if (dashboardTaskList) bindTaskButtons(dashboardTaskList);
  renderFocusTaskOptions();
}

function renderDashboardPreview(scheduleItems, taskItems, doneCount, taskTotal) {
  const scheduleTitle = document.getElementById("dashboardSchedulePreview");
  const scheduleMeta = document.getElementById("dashboardScheduleMeta");
  const taskTitle = document.getElementById("dashboardTaskPreview");
  const taskMeta = document.getElementById("dashboardTaskMeta");
  const exerciseTitle = document.getElementById("dashboardExercisePreview");
  const exerciseMeta = document.getElementById("dashboardExerciseMeta");
  const exerciseCard = exerciseTitle?.closest(".exercise-preview");
  if (!scheduleTitle || !scheduleMeta || !taskTitle || !taskMeta || !exerciseTitle || !exerciseMeta) return;

  if (scheduleItems.length) {
    scheduleTitle.innerHTML = scheduleItems.map(renderDashboardScheduleItem).join("");
    scheduleMeta.textContent = "";
  } else {
    scheduleTitle.innerHTML = `<div class="dashboard-empty">今日无课</div>`;
    scheduleMeta.textContent = "";
  }

  if (taskItems.length) {
    taskTitle.innerHTML = taskItems.map(renderDashboardTaskItem).join("");
    taskMeta.textContent = "";
  } else if (taskTotal) {
    taskTitle.innerHTML = `<div class="dashboard-empty">今日清单已完成</div>`;
    taskMeta.textContent = `已完成 ${doneCount}/${taskTotal}`;
  } else {
    taskTitle.innerHTML = `<div class="dashboard-empty">暂无待办</div>`;
    taskMeta.textContent = "可以直接添加";
  }

  const exerciseGoal = exerciseGoalMinutes();
  const minutes = todayExerciseMinutes();
  const remaining = Math.max(0, exerciseGoal - minutes);
  exerciseTitle.textContent = `${minutes}/${exerciseGoal} 分钟`;
  exerciseMeta.textContent = remaining ? `还差 ${remaining} 分钟` : "今日目标完成";
  exerciseCard?.classList.toggle("complete", minutes >= exerciseGoal);
}

function renderDashboardScheduleItem(item) {
  return `
    <div class="dashboard-line schedule-line">
      <time>${escapeHtml(item.time || "--:--")}</time>
      <span>${escapeHtml(item.title)}</span>
    </div>`;
}

function renderDashboardTaskItem(item) {
  return `
    <button class="dashboard-line task-line" type="button" data-toggle-task="${item.id}" data-done-date="${todayISO()}">
      <span class="mini-check" aria-hidden="true"></span>
      <span>${escapeHtml(item.time ? `${item.time} ${item.title}` : item.title)}</span>
    </button>`;
}

function todayExerciseMinutes() {
  const today = todayISO();
  return state.exerciseSessions
    .filter((session) => sessionDate(session) === today)
    .reduce((sum, session) => sum + sessionMinutes(session), 0);
}

function getTodayScheduleItems() {
  const today = todayISO();
  return state.schedule
    .filter((item) => item.day === new Date().getDay())
    .map((item) => ({
      id: item.id,
      title: item.title,
      date: today,
      time: item.time,
      category: "课程",
      schedule: true
    }))
    .sort(sortTasks);
}

function getWeekScheduleItems() {
  const today = new Date();
  const currentDay = today.getDay();
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
  return state.schedule
    .map((item) => {
      const date = new Date(monday);
      const dayOffset = item.day === 0 ? 6 : item.day - 1;
      date.setDate(monday.getDate() + dayOffset);
      return {
        id: item.id,
        title: item.title,
        day: item.day,
        date: dateToISO(date),
        time: item.time,
        category: "课程",
        schedule: true,
        today: item.day === currentDay
      };
    })
    .sort((a, b) => {
      const dayA = a.day === 0 ? 7 : a.day;
      const dayB = b.day === 0 ? 7 : b.day;
      return dayA - dayB || (a.time || "").localeCompare(b.time || "");
    });
}

function getNextFocusText(scheduleItems, taskItems) {
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const upcoming = [...scheduleItems, ...taskItems]
    .filter((item) => item.time && item.time >= nowTime)
    .sort(sortTasks)[0];
  if (upcoming) return `下一项：${upcoming.time} ${upcoming.title}`;
  if (scheduleItems.length || taskItems.length) return "今天剩下的事，按清单慢慢清。";
  return "今天还很清爽，可以先添加一件事。";
}

function renderTodayScheduleItem(item) {
  return `
    <article class="schedule-item">
      <time>${escapeHtml(item.time || "--:--")}</time>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>课程</span>
      </div>
    </article>`;
}

function renderWeekScheduleItem(item) {
  return `
    <article class="schedule-item ${item.today ? "today" : ""}">
      <time>${escapeHtml(item.time || "--:--")}</time>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${weekNames[item.day]}${item.today ? " · 今天" : ""}</span>
      </div>
    </article>`;
}

function renderHabits() {
  const today = todayISO();
  const habitList = document.getElementById("habitList");
  const manageList = document.getElementById("habitManageList");
  const doneCount = state.habits.filter((habit) => habit.doneDates.includes(today)).length;
  const progress = state.habits.length ? Math.round((doneCount / state.habits.length) * 360) : 0;
  document.getElementById("habitDoneCount").textContent = `${doneCount}/${state.habits.length}`;
  const habitRingCount = document.getElementById("habitRingCount");
  const habitRing = document.getElementById("habitRing");
  const habitProgressText = document.getElementById("habitProgressText");
  if (habitRingCount) habitRingCount.textContent = doneCount;
  if (habitRing) habitRing.style.setProperty("--ring-deg", `${progress}deg`);
  if (habitProgressText) habitProgressText.textContent = `打卡 ${doneCount}/${state.habits.length}`;
  document.getElementById("habitProgressBar").style.width = state.habits.length ? `${Math.round((doneCount / state.habits.length) * 100)}%` : "0%";
  if (!state.habits.length) {
    habitList.innerHTML = `<div class="empty empty-compact">暂无打卡</div>`;
    manageList.innerHTML = `<div class="empty empty-compact">可以添加每日打卡</div>`;
    return;
  }
  habitList.innerHTML = state.habits.map((habit) => {
    const done = habit.doneDates.includes(today);
    return `
      <button class="habit-card ${done ? "done" : ""}" type="button" data-toggle-habit="${habit.id}" data-accent="${escapeHtml(habit.accent)}">
        <span class="habit-orb" aria-hidden="true">${done ? "✓" : habitIcon(habit.title)}</span>
        <span>${escapeHtml(habit.title)}</span>
      </button>
    `;
  }).join("");
  manageList.innerHTML = state.habits.map((habit) => `
    <article class="item">
      <div class="item-row">
        <div class="badge">${habitIcon(habit.title)}</div>
        <div class="item-main">
          <div class="item-title">${escapeHtml(habit.title)}</div>
          <div class="item-meta">
            <span>${accentText(habit.accent)}</span>
            <button class="danger-link" type="button" data-delete-habit="${habit.id}">删除</button>
          </div>
        </div>
      </div>
    </article>
  `).join("");
  habitList.querySelectorAll("[data-toggle-habit]").forEach((button) => {
    button.addEventListener("click", () => toggleHabit(button.dataset.toggleHabit));
  });
  manageList.querySelectorAll("[data-delete-habit]").forEach((button) => {
    button.addEventListener("click", () => deleteHabit(button.dataset.deleteHabit));
  });
}

function habitIcon(title) {
  if (/早睡|睡眠|晚安|睡觉/.test(title)) {
    return `<svg class="habit-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.8 14.5A6.2 6.2 0 0 1 9.5 6.2a6.8 6.8 0 1 0 7.3 8.3Z"/><path d="M15.8 5.2h3l-3 3.4h3"/></svg>`;
  }
  if (/英语|英文|外语|单词|背词|English/i.test(title)) {
    return `<svg class="habit-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 17.5V7.2h6.2"/><path d="M6.2 12h5.4"/><path d="M6.2 17.5h6.5"/><path d="M16 8.5v9"/><path d="M16 8.5h2.8a2.1 2.1 0 0 1 0 4.2H16"/><path d="M16 12.7h3.2a2.4 2.4 0 0 1 0 4.8H16"/></svg>`;
  }
  if (/自律|坚持|克制|规律/.test(title)) {
    return `<svg class="habit-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.2" r="2.1"/><path d="M8 12.2c1.2-1.2 2.5-1.8 4-1.8s2.8.6 4 1.8"/><path d="M9.2 13.2 6 17.4h4.8"/><path d="M14.8 13.2 18 17.4h-4.8"/><path d="M8.4 19.2h7.2"/><path d="M12 10.8v4.8"/></svg>`;
  }
  if (/读|阅读|书/.test(title)) {
    return `<svg class="habit-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5c2.2-.8 4.2-.5 6 .9v12.1c-1.8-1.3-3.8-1.6-6-.8V5.5Z"/><path d="M19.5 5.5c-2.2-.8-4.2-.5-6 .9v12.1c1.8-1.3 3.8-1.6 6-.8V5.5Z"/><path d="M10.5 6.4h3"/></svg>`;
  }
  if (/运动|健身|跑|练/.test(title)) {
    return `<svg class="habit-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10v4"/><path d="M6 8.5v7"/><path d="M8.5 12h7"/><path d="M18 8.5v7"/><path d="M20.5 10v4"/></svg>`;
  }
  if (/写|论文/.test(title)) return "✎";
  if (/水|喝/.test(title)) return "◍";
  return "•";
}

function accentText(accent) {
  return { green: "绿色", blue: "蓝色", peach: "橙色", purple: "紫色", sage: "鼠尾草", rose: "玫瑰", berry: "莓紫", mist: "莓紫", clay: "莓紫" }[accent] || "绿色";
}

function toggleHabit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  const today = todayISO();
  const wasDone = habit.doneDates.includes(today);
  if (wasDone) {
    habit.doneDates = habit.doneDates.filter((date) => date !== today);
  } else {
    habit.doneDates.push(today);
  }
  saveState();
  renderHabits();
  renderStats();
  if (!wasDone) playUiSound("habit-success");
}

function deleteHabit(id) {
  state.habits = state.habits.filter((item) => item.id !== id);
  saveState();
  renderHabits();
  renderStats();
  playUiSound("delete");
}

function sortTasks(a, b) {
  return (a.date || todayISO()).localeCompare(b.date || todayISO()) || (a.time || "99:99").localeCompare(b.time || "99:99");
}

function renderTaskItem(item, doneDate) {
  const isSchedule = item.schedule;
  const done = !isSchedule && isDoneOn(item, doneDate);
  const focused = !isSchedule ? focusMinutesForTask(item, doneDate) : 0;
  return `
    <article class="item">
      <div class="item-row">
        ${isSchedule ? `<div class="badge">课</div>` : `<button class="check-button ${done ? "done" : ""}" type="button" data-toggle-task="${item.id}" data-done-date="${doneDate}" aria-label="切换完成状态">✓</button>`}
        <div class="item-main">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-meta">
            <span>${formatTaskDate(item.date)}</span>
            ${item.time ? `<span>${escapeHtml(item.time)}</span>` : ""}
            <span class="badge">${escapeHtml(item.category)}</span>
            ${focused ? `<span>专注 ${focused} 分钟</span>` : ""}
            ${item.repeat && item.repeat !== "none" ? `<span class="badge repeat-badge">${repeatText(item.repeat)}</span>` : ""}
            ${isSchedule ? "" : `
              <button class="danger-link edit-link" type="button" data-edit-task="${item.id}">编辑</button>
              <button class="danger-link" type="button" data-delete-task="${item.id}">删除</button>
            `}
          </div>
        </div>
      </div>
    </article>`;
}

function focusMinutesForTask(task, date) {
  return (task.focusLogs || [])
    .filter((log) => log.date === date)
    .reduce((sum, log) => sum + Number(log.minutes || 0), 0);
}

function renderFocusTaskOptions() {
  const select = document.getElementById("focusTaskSelect");
  if (!select) return;
  const previous = select.value;
  const todayTasks = state.tasks.filter((task) => taskOccursOn(task, todayISO())).sort(sortTasks);
  select.innerHTML = `<option value="">不绑定</option>` + todayTasks
    .map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.time ? `${task.time} ${task.title}` : task.title)}</option>`)
    .join("");
  if (todayTasks.some((task) => task.id === previous)) select.value = previous;
}

function bindTaskButtons(root) {
  root.querySelectorAll("[data-toggle-task]").forEach((button) => {
    button.addEventListener("click", () => toggleTask(button.dataset.toggleTask, button.dataset.doneDate));
  });
  root.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => deleteTask(button.dataset.deleteTask));
  });
  root.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => editTask(button.dataset.editTask));
  });
}

function repeatText(repeat) {
  return { daily: "重复：每天", weekly: "重复：每周", monthly: "重复：每月", none: "" }[repeat] || "";
}

function toggleTask(id, date) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  if (task.doneDates.includes(date)) task.doneDates = task.doneDates.filter((item) => item !== date);
  else task.doneDates.push(date);
  saveState();
  renderHome();
  renderStats();
  playUiSound("toggle");
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((item) => item.id !== id);
  saveState();
  renderHome();
  renderStats();
  playUiSound("delete");
}

function editTask(id) {
  const index = state.tasks.findIndex((item) => item.id === id);
  if (index < 0) return;
  const task = state.tasks[index];
  const text = prompt("修改这件事", task.rawTitle || task.title);
  if (text === null) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  const next = parseTask(trimmed);
  state.tasks[index] = {
    ...next,
    id: task.id,
    doneDates: task.doneDates || [],
    focusLogs: task.focusLogs || [],
    createdAt: task.createdAt || next.createdAt
  };
  saveState();
  renderHome();
  renderFocusTaskOptions();
  renderStats();
}

function renderNotes() {
  const list = document.getElementById("notesList");
  if (!list) return;
  if (!state.notes.length) {
    list.innerHTML = `<div class="empty">还没有感想。可以从一句话开始。</div>`;
    return;
  }
  list.innerHTML = state.notes.map((note) => `
    <article class="item">
      <div class="item-title">${escapeHtml(note.text).replaceAll("\n", "<br>")}</div>
      <div class="item-meta">
        <span>${formatDateTime(note.createdAt)}</span>
        ${note.tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}
        <button class="danger-link" type="button" data-delete-note="${note.id}">删除</button>
      </div>
    </article>
  `).join("");
  list.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => {
      state.notes = state.notes.filter((note) => note.id !== button.dataset.deleteNote);
      saveState();
      renderNotes();
      playUiSound("delete");
    });
  });
}

function renderSchedule() {
  const list = document.getElementById("scheduleList");
  document.getElementById("scheduleCount").textContent = `${state.schedule.length} 项`;
  if (!state.schedule.length) {
    list.innerHTML = `<div class="empty">还没有循环课表。</div>`;
    return;
  }
  list.innerHTML = state.schedule
    .slice()
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
    .map((item) => `
      <article class="item">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-meta">
          <span>${weekNames[item.day]}</span>
          <span>${escapeHtml(item.time)}</span>
          <button class="danger-link" type="button" data-delete-schedule="${item.id}">删除</button>
        </div>
      </article>
    `).join("");
  list.querySelectorAll("[data-delete-schedule]").forEach((button) => {
    button.addEventListener("click", () => {
      state.schedule = state.schedule.filter((item) => item.id !== button.dataset.deleteSchedule);
      saveState();
      renderAll();
      playUiSound("delete");
    });
  });
}

function getStatsRange() {
  const mode = document.getElementById("statsRange").value;
  const customFields = document.getElementById("customRangeFields");
  const today = todayISO();
  let start = today;
  let end = today;
  if (mode === "7") {
    start = addDays(today, -6);
  } else if (mode === "30") {
    start = addDays(today, -29);
  } else if (mode === "month") {
    start = `${today.slice(0, 7)}-01`;
  } else {
    start = document.getElementById("statsStart").value || today;
    end = document.getElementById("statsEnd").value || today;
    if (start > end) [start, end] = [end, start];
  }
  customFields.classList.toggle("active", mode === "custom");
  return { start, end };
}

function inRange(dateValue, start, end) {
  return dateValue >= start && dateValue <= end;
}

function sessionDate(session) {
  return dateToISO(new Date(session.createdAt));
}

function sessionMinutes(session) {
  if (Number.isFinite(session.minutes)) return session.minutes;
  return Math.max(1, Math.round((session.seconds || 0) / 60));
}

function renderStats() {
  const { start, end } = getStatsRange();
  const dates = eachDate(start, end);
  const focusSessions = state.focusSessions.filter((session) => inRange(sessionDate(session), start, end));
  const exerciseSessions = state.exerciseSessions.filter((session) => inRange(sessionDate(session), start, end));
  const focusMinutes = focusSessions.reduce((sum, session) => sum + sessionMinutes(session), 0);
  const exerciseMinutes = exerciseSessions.reduce((sum, session) => sum + sessionMinutes(session), 0);
  const completedTasks = [];
  state.tasks.forEach((task) => {
    task.doneDates.filter((date) => inRange(date, start, end)).forEach((date) => {
      completedTasks.push({ date, title: task.title, category: task.category });
    });
  });
  const habitDone = state.habits.reduce((sum, habit) => sum + habit.doneDates.filter((date) => inRange(date, start, end)).length, 0);
  const habitTotal = state.habits.length * dates.length;
  const habitRate = habitTotal ? Math.round((habitDone / habitTotal) * 100) : 0;

  document.getElementById("statsExercise").textContent = `${exerciseMinutes} 分钟`;
  document.getElementById("statsFocus").textContent = `${focusMinutes} 分钟`;
  document.getElementById("statsDone").textContent = `${completedTasks.length} 项`;
  document.getElementById("statsHabitRate").textContent = `${habitRate}%`;

  renderTrendChart(dates, focusSessions, exerciseSessions, completedTasks);
  renderDailySummary(dates, focusSessions, exerciseSessions, completedTasks);
  renderCompletedTasks(completedTasks);
  renderTimeSessions(focusSessions, exerciseSessions);
}

function dailyMetricRows(dates, focusSessions, exerciseSessions, completedTasks) {
  return dates.map((date) => ({
    date,
    focus: focusSessions.filter((session) => sessionDate(session) === date).reduce((sum, session) => sum + sessionMinutes(session), 0),
    exercise: exerciseSessions.filter((session) => sessionDate(session) === date).reduce((sum, session) => sum + sessionMinutes(session), 0),
    done: completedTasks.filter((task) => task.date === date).length
  }));
}

function renderTrendChart(dates, focusSessions, exerciseSessions, completedTasks) {
  const svg = document.getElementById("statsTrendChart");
  const rows = dailyMetricRows(dates, focusSessions, exerciseSessions, completedTasks);
  document.getElementById("trendRangeLabel").textContent = `${rows.length} 天`;
  if (!rows.length) {
    svg.innerHTML = "";
    return;
  }
  const width = 360;
  const height = 150;
  const padding = { top: 14, right: 12, bottom: 26, left: 24 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.focus, row.exercise, row.done * 10]));
  const groupWidth = chartWidth / rows.length;
  const barWidth = Math.max(3, Math.min(9, groupWidth / 4));
  const bars = rows.map((row, index) => {
    const x = padding.left + index * groupWidth + groupWidth / 2;
    const values = [
      { key: "exercise", value: row.exercise, color: "#9fc08d", offset: -barWidth },
      { key: "focus", value: row.focus, color: "#8fb2cc", offset: 0 },
      { key: "done", value: row.done * 10, color: "#df8ea0", offset: barWidth }
    ];
    return values.map((bar) => {
      const barHeight = Math.max(1, (bar.value / maxValue) * chartHeight);
      const y = padding.top + chartHeight - barHeight;
      return `<rect x="${(x + bar.offset).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" rx="3" fill="${bar.color}"><title>${row.date} ${bar.key} ${bar.value}</title></rect>`;
    }).join("");
  }).join("");
  const labels = rows.map((row, index) => {
    if (rows.length > 10 && index % Math.ceil(rows.length / 6) !== 0 && index !== rows.length - 1) return "";
    const x = padding.left + index * groupWidth + groupWidth / 2;
    return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle">${row.date.slice(5).replace("-", "/")}</text>`;
  }).join("");
  svg.innerHTML = `
    <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" class="chart-axis"/>
    ${bars}
    ${labels}
  `;
}

function renderDailySummary(dates, focusSessions, exerciseSessions, completedTasks) {
  const list = document.getElementById("dailySummaryList");
  document.getElementById("dailySummaryCount").textContent = `${dates.length} 天`;
  list.innerHTML = dailyMetricRows(dates, focusSessions, exerciseSessions, completedTasks).slice().reverse().map((row) => {
    return `
      <article class="daily-row">
        <time>${formatTaskDate(row.date)}</time>
        <span>运动 ${row.exercise} 分钟</span>
        <span>专注 ${row.focus} 分钟</span>
        <span>完成 ${row.done} 项</span>
      </article>
    `;
  }).join("");
}

function renderCompletedTasks(tasks) {
  const list = document.getElementById("completedTaskList");
  document.getElementById("completedTaskCount").textContent = `${tasks.length} 项`;
  if (!tasks.length) {
    list.innerHTML = `<div class="empty">这个时间段还没有完成事项。</div>`;
    return;
  }
  list.innerHTML = tasks
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((task) => `
      <article class="item">
        <div class="item-title">${escapeHtml(task.title)}</div>
        <div class="item-meta">
          <span>${formatTaskDate(task.date)}</span>
          <span class="badge">${escapeHtml(task.category || "待办")}</span>
        </div>
      </article>
    `).join("");
}

function renderTimeSessions(focusSessions, exerciseSessions) {
  const list = document.getElementById("timeSessionList");
  const sessions = [
    ...focusSessions.map((session) => ({ ...session, kind: "专注" })),
    ...exerciseSessions.map((session) => ({ ...session, kind: "运动" }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById("timeSessionCount").textContent = `${sessions.length} 条`;
  if (!sessions.length) {
    list.innerHTML = `<div class="empty">完成专注或运动后，时间会自动记录在这里。</div>`;
    return;
  }
  list.innerHTML = sessions.map((session) => `
    <article class="item">
      <div class="item-title">${escapeHtml(session.title || session.kind)} <span class="text-muted">${sessionMinutes(session)} 分钟</span></div>
      <div class="item-meta">
        <span>${formatDateTime(session.createdAt)}</span>
        <span class="badge">${session.kind}</span>
      </div>
    </article>
  `).join("");
}

function notesToMarkdown() {
  const lines = ["# 个人感想", ""];
  state.notes.forEach((note) => {
    lines.push(`## ${formatDateTime(note.createdAt)}`);
    lines.push("");
    lines.push(`标签：${note.tags.join("、") || "无"}`);
    lines.push("");
    lines.push(note.text);
    lines.push("");
  });
  return lines.join("\n");
}

function collectReportData(start, end) {
  const dates = eachDate(start, end);
  const focusSessions = state.focusSessions.filter((session) => inRange(sessionDate(session), start, end));
  const exerciseSessions = state.exerciseSessions.filter((session) => inRange(sessionDate(session), start, end));
  const completedTasks = [];
  state.tasks.forEach((task) => {
    task.doneDates.filter((date) => inRange(date, start, end)).forEach((date) => {
      completedTasks.push({ date, title: task.title, category: task.category });
    });
  });
  const notes = state.notes.filter((note) => inRange(dateToISO(new Date(note.createdAt)), start, end));
  const habitDone = state.habits.reduce((sum, habit) => sum + habit.doneDates.filter((date) => inRange(date, start, end)).length, 0);
  const habitTotal = state.habits.length * dates.length;
  return { dates, focusSessions, exerciseSessions, completedTasks, notes, habitDone, habitTotal };
}

function reportToMarkdown(start, end, title) {
  const data = collectReportData(start, end);
  const focusMinutes = data.focusSessions.reduce((sum, session) => sum + sessionMinutes(session), 0);
  const exerciseMinutes = data.exerciseSessions.reduce((sum, session) => sum + sessionMinutes(session), 0);
  const habitRate = data.habitTotal ? Math.round((data.habitDone / data.habitTotal) * 100) : 0;
  const lines = [`# 个人工作台${title}`, "", `范围：${start}${start === end ? "" : ` 至 ${end}`}`, ""];
  lines.push("## 汇总", "");
  lines.push(`- 运动：${exerciseMinutes} 分钟`);
  lines.push(`- 专注：${focusMinutes} 分钟`);
  lines.push(`- 完成事项：${data.completedTasks.length} 项`);
  lines.push(`- 打卡率：${habitRate}%`);
  lines.push("");
  lines.push("## 每日汇总", "");
  dailyMetricRows(data.dates, data.focusSessions, data.exerciseSessions, data.completedTasks).forEach((row) => {
    lines.push(`- ${row.date}：运动 ${row.exercise} 分钟；专注 ${row.focus} 分钟；完成 ${row.done} 项`);
  });
  lines.push("");
  lines.push("## 完成事项", "");
  if (data.completedTasks.length) {
    data.completedTasks.sort((a, b) => a.date.localeCompare(b.date)).forEach((task) => {
      lines.push(`- ${task.date} [${task.category || "待办"}] ${task.title}`);
    });
  } else {
    lines.push("- 无");
  }
  lines.push("");
  lines.push("## 时间记录", "");
  const sessions = [
    ...data.focusSessions.map((session) => ({ ...session, kind: "专注" })),
    ...data.exerciseSessions.map((session) => ({ ...session, kind: "运动" }))
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (sessions.length) {
    sessions.forEach((session) => {
      lines.push(`- ${formatDateTime(session.createdAt)} [${session.kind}] ${session.title || session.kind}：${sessionMinutes(session)} 分钟`);
    });
  } else {
    lines.push("- 无");
  }
  lines.push("");
  lines.push("## 个人感想", "");
  if (data.notes.length) {
    data.notes.forEach((note) => {
      lines.push(`### ${formatDateTime(note.createdAt)}`);
      lines.push(`标签：${note.tags.join("、") || "无"}`);
      lines.push("");
      lines.push(note.text);
      lines.push("");
    });
  } else {
    lines.push("- 无");
  }
  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  const backup = {};
  arrayStateKeys.forEach((key) => {
    backup[key] = state[key];
  });
  backup.settings = state.settings;
  downloadText(`个人工作台备份-${todayISO()}.json`, JSON.stringify(backup, null, 2));
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      arrayStateKeys.forEach((key) => {
        if (Array.isArray(data[key])) state[key] = data[key];
      });
      if (data.settings && typeof data.settings === "object") {
        state.settings = { ...state.settings, ...data.settings };
      }
      saveState();
      applySettings();
      renderAll();
      playUiSound("save");
      alert("导入完成");
    } catch {
      playUiSound("error");
      alert("备份文件无法识别");
    }
  };
  reader.readAsText(file);
}

init();
