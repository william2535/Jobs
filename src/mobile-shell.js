/** Mobile workspace over actual local records. No remote schedule, stock service or notifications. */
import { jobTypeLabel } from "./job-options.js";
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
const minutesFor = (entry) => {
  if (
    typeof entry.hours === "number" &&
    Number.isFinite(entry.hours) &&
    entry.hours >= 0
  )
    return Math.round(entry.hours * 60);
  if (
    /^\d\d:\d\d$/.test(entry.start || "") &&
    /^\d\d:\d\d$/.test(entry.end || "")
  ) {
    const minutes = (value) =>
      Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    return Math.max(0, minutes(entry.end) - minutes(entry.start));
  }
  return 0;
};
export function recordedTimeLabel(minutes) {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

/** Derived facts only: a completed checklist does not imply tested equipment or completed visits. */
export function mobileWorkspaceSummary(state, today) {
  const jobs = list(state.jobs);
  const timesheets = jobs.flatMap((job) =>
    list(job.workflow?.timesheets).map((entry) => ({ job, entry })),
  );
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
    todayMinutes: timesheets
      .filter(({ entry }) => entry.date === today)
      .reduce((sum, { entry }) => sum + minutesFor(entry), 0),
    totalMinutes: timesheets.reduce(
      (sum, { entry }) => sum + minutesFor(entry),
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
  stock: ["M3 7l9-4 9 4-9 4z", "M3 7v10l9 4 9-4V7", "M12 11v10", "M7 5l10 4"],
  timesheets: ["M12 8v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
  about: ["M12 10v7", "M12 6v1", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
  toolbox: ["M7 8V5h10v3", "M3 8h18v12H3z", "M3 13h18", "M10 11v4h4v-4"],
  add: ["M12 4v16", "M4 12h16"],
  plan: ["M4 3h7v6h9v12H4z", "M4 12h7v9", "M14 9v6h6"],
  import: ["M12 3v12", "M7 10l5 5 5-5", "M4 16v5h16v-5"],
  sites: ["M3 11l9-8 9 8", "M5 10v11h14V10", "M10 21v-7h4v7"],
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
  onAction = () => {},
  now = new Date(),
}) {
  const root = node("section", undefined, "mobile-workspace");
  root.setAttribute("aria-label", "Mobile workspace");
  const today = localDay(now);
  const nextDay = new Date(now);
  nextDay.setDate(nextDay.getDate() + 1);
  const tomorrow = localDay(nextDay);
  const summary = mobileWorkspaceSummary(state, today);
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
      if (action === "create" && !list(state.sites).length) {
        button.disabled = true;
        button.title = "Create a site first";
      }
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
    head.append(
      node("strong", siteFor(job)?.name || "Site not set"),
      icon("chevron"),
    );
    const meta = node("div", undefined, "mw-card-meta");
    meta.append(
      node("span", job.workflow?.details?.reference || job.id.slice(0, 8)),
      node("span", job.status, "mw-status"),
    );
    card.append(head, node("span", jobTitle(job), "mw-job-title"), meta);
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
    row.append(time, card);
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
              : "Create a site or import a Zone Sketch drawing to start.",
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
        "recorded today",
        summary.todayMinutes ? 1 : 0,
        "mw-time-ring",
      ),
    );
    const tools = node("div", undefined, "mw-toolbox");
    const toolbox = control("", () =>
      root
        .querySelector(".mw-shortcuts")
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
    toolbox.append(icon("toolbox"), node("strong", "Toolbox"));
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
    tools.append(toolbox, overdue);
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
  function products() {
    return listScreen(
      "Stock & materials",
      "Products and labour recorded against your jobs. These are job quantities, not a live stock balance.",
      summary.products,
      ({ job, entry }) => {
        const card = control("", () => goJob(job), "mw-record-card");
        const heading = node("div", undefined, "mw-card-head");
        heading.append(node("strong", entry.description), icon("chevron"));
        card.append(
          heading,
          node(
            "span",
            `${entry.quantity} ${entry.unit || "each"} · ${entry.complete ? "Used / complete" : "Planned"}`,
            "mw-record-value",
          ),
          node("small", siteFor(job)?.name || "Site not set"),
        );
        return card;
      },
      "No materials recorded",
    );
  }
  function timesheets() {
    return listScreen(
      "Timesheets",
      `${recordedTimeLabel(summary.totalMinutes)} recorded across your saved jobs. Open a job’s Finalisation section to add or edit time.`,
      [...summary.timesheets].sort((a, b) =>
        (b.entry.date || "").localeCompare(a.entry.date || ""),
      ),
      ({ job, entry }) => {
        const card = control("", () => goJob(job), "mw-record-card");
        const heading = node("div", undefined, "mw-card-head");
        heading.append(
          node("strong", siteFor(job)?.name || "Site not set"),
          icon("chevron"),
        );
        card.append(
          heading,
          node(
            "span",
            `${dateLabel(entry.date)} · ${recordedTimeLabel(minutesFor(entry))}`,
            "mw-record-value",
          ),
        );
        if (entry.start && entry.end)
          card.append(node("span", `${entry.start} – ${entry.end}`));
        if (entry.note) card.append(node("span", entry.note, "mw-description"));
        card.append(
          node(
            "small",
            entry.engineer || job.engineer || "Engineer not recorded",
          ),
        );
        return card;
      },
      "No time recorded",
    );
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
          : tab === "Stock"
            ? products()
            : tab === "Timesheets"
              ? timesheets()
              : about();
    const navigation = node("nav", undefined, "mw-bottom-nav");
    navigation.setAttribute("aria-label", "Mobile workspace");
    for (const [label, symbol] of [
      ["Dashboard", "dashboard"],
      ["Tasks", "tasks"],
      ["Stock", "stock"],
      ["Timesheets", "timesheets"],
      ["About", "about"],
    ]) {
      const button = control(
        "",
        () => {
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
  paint();
  return root;
}
