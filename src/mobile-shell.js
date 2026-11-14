/** Mobile workspace over actual local records. No remote schedule, stock service or notifications. */
import { DEFAULT_ZONE_SKETCH_URL } from "./zone-handoff.js";
import { jobTypeLabel } from "./job-options.js";
import { renderTimesheets } from "./timesheets-ui.js";
import { timesheetEntries, splitTimesheetByDay, minutesForTimesheet, isWorkSession } from "./timesheets.js";
const list = (value) => (Array.isArray(value) ? value : []);
const pad = (value) => String(value).padStart(2, "0");
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const localDay = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateLabel = (value) => {
  if (!value) return "Not scheduled";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
export function recordedTimeLabel(minutes) {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

/** Derived facts only: a completed checklist does not imply tested equipment or completed visits. */
export function mobileWorkspaceSummary(state, today) {
  const jobs = list(state.jobs);
  const timesheets = timesheetEntries(state);
  const counted = timesheets.filter(({ conflict }) => !conflict);
  const minutesToday = entry => splitTimesheetByDay(entry).filter(segment => segment.date === today).reduce((sum, segment) => sum + segment.minutes, 0);
  const appointments = jobs.flatMap((job) =>
    list(job.workflow?.appointments).map((entry) => ({ job, entry })),
  );
  const overdueIds = new Set(
    jobs
      .filter(
        (job) =>
          job.status !== "Complete" &&
          (list(job.workflow?.appointments).some(
            (entry) => entry.date && entry.date < today,
          ) ||
            (!list(job.workflow?.appointments).length &&
              job.visitDate &&
              job.visitDate < today)),
      )
      .map((job) => job.id),
  );
  return {
    total: jobs.length,
    completed: jobs.filter((job) => job.status === "Complete").length,
    open: jobs.filter((job) => job.status !== "Complete").length,
    overdue: overdueIds.size,
    overdueIds: [...overdueIds],
    todayMinutes: counted.filter(({ entry }) => isWorkSession(entry))
      .reduce((sum, { entry }) => sum + minutesToday(entry), 0),
    todayTravelMinutes: counted.filter(({ entry }) => entry.sessionType === "Travel").reduce((sum, { entry }) => sum + minutesToday(entry), 0),
    todayBreakMinutes: counted.filter(({ entry }) => entry.sessionType === "Break").reduce((sum, { entry }) => sum + minutesToday(entry), 0),
    timesheetConflicts: timesheets.filter(({ conflict }) => conflict).length,
    totalMinutes: counted.reduce(
      (sum, { entry }) => sum + minutesForTimesheet(entry),
      0,
    ),
    timesheets,
    appointments,
    todayAppointments: appointments.filter(({ entry }) => entry.date === today)
      .length,
    products: jobs.flatMap((job) =>
      list(job.workflow?.products).map((entry) => ({ job, entry })),
    ),
  };
}

const paths = {
  dashboard: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h7v7h-7z"],
  tasks: ["M8 3h8v4H8z", "M8 5H5v16h14V5h-3", "M8 12h8", "M8 16h6"],
  timesheets: ["M12 8v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
  about: ["M12 10v7", "M12 6v1", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
  toolbox: ["M7 8V5h10v3", "M3 8h18v12H3z", "M3 13h18", "M10 11v4h4v-4"],
  add: ["M12 4v16", "M4 12h16"],
  plan: ["M4 3h7v6h9v12H4z", "M4 12h7v9", "M14 9v6h6"],
  import: ["M12 3v12", "M7 10l5 5 5-5", "M4 16v5h16v-5"],
  sites: ["M3 11l9-8 9 8", "M5 10v11h14V10", "M10 21v-7h4v7"],
  settings: [
    "M10 3h4l.6 2.4 2 1.2 2.4-.7 2 3.5-1.8 1.7v2.3l1.8 1.7-2 3.5-2.4-.7-2 1.2L14 21h-4l-.6-2.4-2-1.2-2.4.7-2-3.5 1.8-1.7v-2.3L3 8.9l2-3.5 2.4.7 2-1.2z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  chevron: ["M9 5l7 7-7 7"],
  calendar: [
    "M4 5h16v16H4z",
    "M8 3v4",
    "M16 3v4",
    "M4 10h16",
    "M8 14h2",
    "M14 14h2",
  ],
};
function icon(name) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  element.setAttribute("viewBox", "0 0 24 24");
  element.setAttribute("aria-hidden", "true");
  for (const value of paths[name] || paths.tasks) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", value);
    element.append(path);
  }
  return element;
}
function control(label, action, className = "") {
  const element = node("button", label, className);
  element.type = "button";
  element.onclick = action;
  return element;
}

/** Parent renders only this home view below 700px, keeping the existing desktop workspace intact. */
export function renderMobileWorkspace({
  state,
  onAction: handleAction = () => {},
  onSaveTimesheet,
  onDeleteTimesheet,
  onSubmitTimesheets,
  onExportTimesheets,
  onDirty = () => {},
  now = new Date(),
}) {
  const root = node("section", undefined, "mobile-workspace");
  root.setAttribute("aria-label", "Mobile workspace");
  const today = localDay(now);
  const nextDay = new Date(now);
  nextDay.setDate(nextDay.getDate() + 1);
  const tomorrow = localDay(nextDay);
  let summary = mobileWorkspaceSummary(state, today), timesheetView = null, timesheetViewState = null;
  let disposed = false;
  const confirmLeave = () => !timesheetView || timesheetView.confirmLeave?.() !== false;
  const onAction = (action) => {
    if (!confirmLeave()) return;
    onDirty(false);
    handleAction(action);
  };
  const persistTimesheet = (callback) => async (payload) => {
    if (typeof callback !== "function") throw Error("Timesheet saving is unavailable. Your changes have not been saved.");
    const saved = await callback(payload);
    if (saved?.state && !disposed) {
      state = saved.state;
      summary = mobileWorkspaceSummary(state, today);
    }
    return saved;
  };
  let tab = "Dashboard",
    dateFilter = "",
    query = "",
    onlyOverdue = false,
    showCalendar = false;
  const siteFor = (job) =>
    list(state.sites).find((site) => site.id === job.siteId);
  const jobTitle = (job) =>
    job.workflow?.details?.title || jobTypeLabel(job) || "Untitled job";
  const goJob = (job) => onAction(`job:${job.id}`);
  const empty = (title, detail) => {
    const box = node("div", undefined, "mw-empty");
    box.append(node("strong", title), node("p", detail));
    return box;
  };
  function ring(value, label, detail, ratio, className = "") {
    const item = node("div", undefined, "mw-stat");
    const circle = node("div", undefined, `mw-ring ${className}`);
    circle.style.setProperty(
      "--progress",
      String(Math.max(0, Math.min(1, ratio)) * 100),
    );
    circle.append(node("strong", value));
    item.append(circle, node("strong", label), node("span", detail));
    return item;
  }
  function sectionHeading(title, extra) {
    const heading = node("div", undefined, "mw-section-heading");
    heading.append(node("h2", title));
    if (extra) heading.append(extra);
    return heading;
  }
  function shortcuts() {
    const quick = node("div", undefined, "mw-shortcuts");
    quick.setAttribute("aria-label", "Workspace actions");
    for (const [label, action, symbol] of [
      ["Create job", "create", "add"],
      ["Import Zone Sketch", "import-zone", "plan"],
      ["Import job", "import-job", "import"],
      ["Sites", "sites", "sites"],
    ]) {
      const button = control("", () => onAction(action));
      button.dataset.action = action;
      button.append(icon(symbol), node("span", label));
      quick.append(button);
    }
    return quick;
  }
  function scheduleEntry(job) {
    const appointments = list(job.workflow?.appointments);
    if (dateFilter)
      return (
        appointments.find((entry) => entry.date === dateFilter) ||
        (job.visitDate === dateFilter ? { date: job.visitDate } : null)
      );
    const sorted = [...appointments].sort((a, b) =>
      `${a.date || "9999"}${a.start || ""}`.localeCompare(
        `${b.date || "9999"}${b.start || ""}`,
      ),
    );
    return (
      sorted.find((entry) => entry.date >= today) ||
      sorted.at(-1) || { date: job.visitDate || "" }
    );
  }
  function jobCard(job, appointment) {
    const row = node("div", undefined, "mw-timeline-row");
    const site = siteFor(job);
    const time = node("div", undefined, "mw-time");
    if (appointment?.start) {
      time.append(node("span", appointment.start));
      if (appointment.end)
        time.append(
          node("span", "│", "mw-time-divider"),
          node("span", appointment.end),
        );
      if (!dateFilter && appointment.date)
        time.append(node("small", dateLabel(appointment.date)));
    } else time.append(node("small", dateLabel(appointment?.date)));
    const card = control(
      "",
      () => goJob(job),
      `mw-job-card${job.status === "Complete" ? " mw-complete" : ""}`,
    );
    card.dataset.testid = "job-card";
    card.dataset.action = `job:${job.id}`;
    const head = node("div", undefined, "mw-card-head");
    head.append(node("strong", site?.name || job.workflow?.details?.title || "Untitled job"));
    const meta = node("div", undefined, "mw-card-meta");
    meta.append(
      node("span", job.workflow?.details?.reference || job.id.slice(0, 8)),
      node("span", job.status, "mw-status"),
    );
    card.append(head, node("span", site ? jobTitle(job) : "No site", "mw-job-title"), meta);
    const description = job.workflow?.details?.description || job.scope;
    if (description) card.append(node("span", description, "mw-description"));
    if (job.importConflict)
      card.append(node("span", "Preserved conflict", "mw-conflict"));
    const footer = node("div", undefined, "mw-card-footer");
    footer.append(
      node("span", appointment?.engineer || job.engineer || "Unassigned"),
      icon("calendar"),
    );
    card.append(footer);
    const shell = node("div", undefined, "mw-job-card-shell");
    const settings = control("", () => onAction(`job-settings:${job.id}`), "mw-job-settings");
    settings.dataset.action = `job-settings:${job.id}`;
    settings.dataset.testid = "job-settings";
    settings.setAttribute("aria-label", `Settings for ${job.workflow?.details?.title || site?.name || "Untitled job"}`);
    settings.title = "Job settings";
    settings.append(icon("settings"));
    shell.append(card, settings);
    row.append(time, shell);
    return row;
  }
  function jobsSection() {
    const section = node("section", undefined, "mw-schedule");
    const filters = node("div", undefined, "mw-date-filters");
    filters.setAttribute("aria-label", "Schedule date");
    for (const [label, value] of [
      ["Today", today],
      ["Tomorrow", tomorrow],
      ["All", ""],
    ]) {
      const choose = control(
        label,
        () => {
          dateFilter = value;
          onlyOverdue = false;
          paint();
        },
        dateFilter === value && !onlyOverdue ? "selected" : "",
      );
      choose.setAttribute(
        "aria-pressed",
        String(dateFilter === value && !onlyOverdue),
      );
      filters.append(choose);
    }
    const calendar = control(
      "",
      () => {
        showCalendar = !showCalendar;
        paint();
        if (showCalendar) root.querySelector("[data-mobile-date]")?.focus();
      },
      "mw-calendar-toggle",
    );
    calendar.append(icon("calendar"), node("span", "Calendar"));
    calendar.setAttribute("aria-expanded", String(showCalendar));
    filters.append(calendar);
    section.append(filters);
    if (showCalendar) {
      const label = node("label", "Choose date", "mw-date-picker");
      const input = node("input");
      input.type = "date";
      input.dataset.mobileDate = "";
      input.value = dateFilter || today;
      input.onchange = () => {
        dateFilter = input.value;
        onlyOverdue = false;
        paint();
      };
      label.append(input);
      section.append(label);
    }
    if (tab === "Tasks") {
      const label = node("label", "Find a job", "mw-search");
      const input = node("input");
      input.type = "search";
      input.value = query;
      input.placeholder = "Site, reference or description";
      input.oninput = () => {
        query = input.value;
        refreshCards();
      };
      label.append(input);
      section.append(label);
    }
    const title = onlyOverdue
      ? "Overdue visits"
      : dateFilter
        ? `Visits · ${dateLabel(dateFilter)}`
        : "Saved jobs";
    const heading = sectionHeading(
      title,
      node("span", "On this device", "mw-caption"),
    );
    const cards = node("div", undefined, "mw-job-list");
    function refreshCards() {
      cards.replaceChildren();
      const text = query.trim().toLocaleLowerCase();
      const filtered = list(state.jobs).filter(
        (job) =>
          (!onlyOverdue || summary.overdueIds.includes(job.id)) &&
          (!dateFilter || scheduleEntry(job)) &&
          (!text ||
            [
              siteFor(job)?.name,
              jobTitle(job),
              job.workflow?.details?.reference,
              job.scope,
            ].some((value) =>
              String(value || "")
                .toLocaleLowerCase()
                .includes(text),
            )),
      );
      filtered.sort((a, b) => {
        const aa = scheduleEntry(a),
          bb = scheduleEntry(b);
        return `${aa?.date || "9999"}${aa?.start || "99:99"}`.localeCompare(
          `${bb?.date || "9999"}${bb?.start || "99:99"}`,
        );
      });
      for (const job of filtered)
        cards.append(jobCard(job, scheduleEntry(job)));
      if (!filtered.length)
        cards.append(
          empty(
            dateFilter || onlyOverdue || query
              ? "No matching visits"
              : "Ready for your first job",
            dateFilter || onlyOverdue || query
              ? "Choose another day or All to see your saved jobs."
              : "Create a job to start writing. You can add a site in job settings.",
          ),
        );
    }
    refreshCards();
    section.append(heading);
    if (onlyOverdue)
      section.append(
        node(
          "p",
          "Open jobs with a past appointment or visit date.",
          "mw-screen-description",
        ),
      );
    section.append(cards);
    return section;
  }
  function dashboard() {
    const content = node("div", undefined, "mw-dashboard");
    const metrics = node("div", undefined, "mw-metrics");
    metrics.append(
      ring(
        `${summary.completed} of ${summary.total}`,
        "Completed",
        "saved jobs",
        summary.total ? summary.completed / summary.total : 0,
      ),
      ring(
        recordedTimeLabel(summary.todayMinutes),
        "Work",
        summary.timesheetConflicts ? "duplicate sessions excluded" : "recorded today",
        summary.todayMinutes ? 1 : 0,
        "mw-time-ring",
      ),
    );
    const tools = node("div", undefined, "mw-toolbox");
    const toolbox = control("", () => onAction("toolbox"));
    toolbox.append(icon("toolbox"), node("strong", "Toolbox"));
    const findr = node("a", undefined, "mw-findr");
    findr.href = "https://findr-fault-finder.floodyyy21.chatgpt.site/app/";
    findr.target = "_blank";
    findr.rel = "noopener noreferrer";
    findr.setAttribute("aria-label", "Open FINDR");
    findr.title = "Open FINDR";
    const findrCircle = node("span", undefined, "mw-findr-circle");
    const findrLogo = node("img");
    findrLogo.src = "./findr-logo.png";
    findrLogo.alt = "";
    findrLogo.width = 38;
    findrLogo.height = 38;
    findrCircle.append(findrLogo);
    findr.append(findrCircle, node("strong", "FINDR"));
    const overdue = control("", () => {
      tab = "Tasks";
      onlyOverdue = true;
      dateFilter = "";
      paint();
    });
    overdue.append(
      node("span", String(summary.overdue), "mw-count-circle"),
      node("span", "Overdue"),
    );
    overdue.setAttribute("aria-label", `${summary.overdue} overdue visits`);
    tools.append(toolbox, findr, overdue);
    metrics.append(tools);
    content.append(metrics, shortcuts());
    if (!summary.total)
      content.append(
        control(
          "Explore demonstration site",
          () => onAction("demo"),
          "mw-demo",
        ),
      );
    content.append(jobsSection());
    return content;
  }
  function listScreen(title, description, records, renderRecord, emptyText) {
    const content = node("section", undefined, "mw-records-screen");
    content.append(
      sectionHeading(title),
      node("p", description, "mw-screen-description"),
    );
    const rows = node("div", undefined, "mw-record-list");
    for (const record of records) rows.append(renderRecord(record));
    if (!records.length)
      rows.append(empty(emptyText, "Open a job to add its records."));
    content.append(rows);
    if (!records.length)
      content.append(
        control(
          "View jobs",
          () => {
            tab = "Tasks";
            paint();
          },
          "mw-blue-button",
        ),
      );
    return content;
  }
  function timesheets() {
    timesheetView = renderTimesheets({
      state,
      initialDate: timesheetViewState?.date || today,
      viewState: timesheetViewState,
      onSave: persistTimesheet(onSaveTimesheet),
      onDelete: persistTimesheet(onDeleteTimesheet),
      onSubmit: persistTimesheet(onSubmitTimesheets),
      onExport: onExportTimesheets ? persistTimesheet(onExportTimesheets) : undefined,
      onDirty,
    });
    return timesheetView;
  }
  function about() {
    const section = node("section", undefined, "mw-records-screen");
    section.append(sectionHeading("About Jobs"));
    const card = node("article", undefined, "mw-about-card");
    card.append(
      node("h3", "Your local field workspace"),
      node(
        "p",
        "Create visits, view included plans, record work and export your evidence. Your site record stays separate from each job.",
      ),
      node(
        "p",
        "The save status above shows whether your latest work is stored. Prepare the app online once for offline use, and export jobs regularly to keep a backup.",
      ),
      node(
        "p",
        "Draft service reports are records of the visit. Validated certificates and the local FINDR adapter are future work.",
      ),
    );
    section.append(
      card,
      shortcuts(),
      control(
        "Protect local storage",
        () => onAction("persist"),
        "mw-blue-button",
      ),
    );
    return section;
  }
  function paint() {
    if (disposed) return;
    root.classList.toggle("mw-timesheets-active", tab === "Timesheets");
    if (timesheetView) {
      timesheetViewState = timesheetView.getViewState?.() || timesheetViewState;
      timesheetView.dispose?.();
      timesheetView = null;
    }
    root.replaceChildren();
    const header = node("div", undefined, "mw-header");
    const title = node("a", undefined, "mw-home-link");
    title.href = "#";
    title.dataset.action = "home";
    title.onclick = (event) => {
      event.preventDefault();
      onAction("home");
    };
    title.append(
      node("span", "JOBS", "mw-brand"),
      node(
        "h1",
        tab === "Dashboard"
          ? now.getHours() < 12
            ? "Good morning."
            : now.getHours() < 18
              ? "Good afternoon."
              : "Good evening."
          : tab,
      ),
    );
    const open = control(
      "",
      () => {
        if (!confirmLeave()) return;
        onDirty(false);
        tab = "Tasks";
        dateFilter = "";
        query = "";
        onlyOverdue = false;
        paint();
      },
      "mw-open-jobs",
    );
    open.setAttribute("aria-label", `${summary.open} open jobs`);
    open.append(icon("tasks"), node("span", String(summary.open)));
    header.append(title, open);
    const content =
      tab === "Dashboard"
        ? dashboard()
        : tab === "Tasks"
          ? jobsSection()
          : tab === "Timesheets"
            ? timesheets()
            : about();
    const navigation = node("nav", undefined, "mw-bottom-nav");
    navigation.setAttribute("aria-label", "Mobile workspace");
    for (const [label, symbol] of [
      ["Dashboard", "dashboard"],
      ["Tasks", "tasks"],
      ["Zone Sketch", "plan"],
      ["Timesheets", "timesheets"],
      ["About", "about"],
    ]) {
      if (label === "Zone Sketch") {
        const link = node("a", undefined, "mw-zone-sketch");
        link.href = DEFAULT_ZONE_SKETCH_URL;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = "Open Zone Sketch";
        const logo = node("img", undefined, "mw-zone-sketch-logo");
        logo.src = "./zone-sketch-logo.png";
        logo.alt = "";
        logo.width = 26;
        logo.height = 26;
        link.append(logo, node("span", label));
        navigation.append(link);
        continue;
      }
      const button = control(
        "",
        () => {
          if (label === tab || !confirmLeave()) return;
          onDirty(false);
          tab = label;
          dateFilter = "";
          query = "";
          onlyOverdue = false;
          paint();
          root.scrollIntoView({ block: "start" });
        },
        tab === label ? "active" : "",
      );
      button.append(icon(symbol), node("span", label));
      if (tab === label) button.setAttribute("aria-current", "page");
      navigation.append(button);
    }
    root.append(header, content, navigation);
  }
  root.confirmLeave = confirmLeave;
  root.dispose = () => {
    disposed = true;
    timesheetView?.dispose?.();
    timesheetView = null;
  };
  paint();
  return root;
}
