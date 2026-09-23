import {
  isStale,
  labels,
  parseStatus,
  pollDelay,
  type StatusData,
  type Message,
} from "./status";
const get = (id: string) => document.getElementById(id)!;
const refresh = get("refresh") as HTMLButtonElement;
const overview = document.querySelector<HTMLElement>(".overview")!;
const endpoint = get("main").dataset.endpoint!;
const formatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});
const formatDate = (value: string) =>
  formatter.format(new Date(value)) + " Uhr";
let data: StatusData | undefined;
let failed = false;
let pending = false;
let timer: ReturnType<typeof setTimeout>;
let nextRefreshAt = 0;
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) => {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
};
function badge(text: string, state: string) {
  const node = el("span", text, "badge");
  node.dataset.state = state;
  return node;
}
function announce(text: string) {
  if (get("announcement").textContent !== text)
    get("announcement").textContent = text;
}
function renderCountdown() {
  get("countdown").textContent = pending
    ? "Wird aktualisiert …"
    : `Nächste Aktualisierung in ${Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000))} Sekunden`;
}
function renderSectionNotices() {
  const stale = data ? isStale(data) : false;
  for (const [id, label] of [
    ["services", "Dienstestatus"],
    ["messages", "Aktuelle Meldungen"],
    ["archive", "Vergangene Meldungen"],
  ]) {
    const notice = get(`${id}-notice`);
    notice.hidden = !failed && !stale;
    notice.textContent = failed
      ? `${label} konnten nicht geladen werden. Wir versuchen es automatisch erneut.${data ? " Angezeigt werden die zuletzt geladenen Informationen." : ""}`
      : stale
        ? `${label} sind möglicherweise nicht aktuell. Angezeigt werden die zuletzt geladenen Informationen.`
        : "";
    // A failed request must never look like confirmation that no incidents exist.
    get(id)
      .querySelectorAll<HTMLElement>(".empty")
      .forEach((node) => {
        node.hidden = failed;
      });
  }
}
function renderOverview() {
  renderSectionNotices();
  if (!data) return;
  const stale = isStale(data);
  overview.dataset.state = stale || failed ? "unknown" : data.overall.status;
  const title = stale
    ? "Statusinformationen möglicherweise nicht aktuell"
    : failed
      ? "Aktualisierung derzeit nicht möglich"
      : data.overall.title;
  get("overall-title").textContent = title;
  get("overall-message").textContent =
    stale || failed
      ? `Letzter bekannter Zustand: ${data.overall.title}. ${data.overall.message} Wir versuchen es automatisch erneut.`
      : data.overall.message;
  get("updated").textContent =
    `Zuletzt aktualisiert: ${formatDate(data.generatedAt)}${stale ? " · möglicherweise veraltet" : ""}`;
  announce(title);
}
function renderServices() {
  if (!data) return;
  const rows = [...data.services]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((service) => {
      const row = el("article", "", "service");
      const copy = el("div");
      copy.append(el("h3", service.name));
      if (service.description) copy.append(el("p", service.description));
      const meta = el("div", "", "service-meta");
      meta.append(
        badge(service.statusText || labels[service.status], service.status),
      );
      if (service.monitored && service.checkedAt)
        meta.append(el("small", `Geprüft: ${formatDate(service.checkedAt)}`));
      if (service.lastChangedAt)
        row.title = `Status unverändert seit ${formatDate(service.lastChangedAt)}`;
      row.append(copy, meta);
      return row;
    });
  get("services").replaceChildren(
    ...(rows.length
      ? rows
      : [el("p", "Derzeit sind keine Dienste hinterlegt.", "empty")]),
  );
}
const messageLabels = {
  planned: "Geplant",
  open: "Offen",
  in_progress: "In Bearbeitung",
  monitoring: "Unter Beobachtung",
  resolved: "Abgeschlossen",
};
const categoryLabels = {
  notice: "Information",
  maintenance: "Wartung",
  incident: "Störung",
};
function renderMessages(id: string, messages: Message[]) {
  const target = get(id);
  const openIds = new Set(
    [...target.querySelectorAll<HTMLDetailsElement>("details[open]")].map(
      (node) => node.dataset.id,
    ),
  );
  const nodes = [...messages]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((message) => {
      const card = el("article", "", "message-card");
      card.dataset.severity = message.severity;
      const meta = el("div", "", "message-meta");
      meta.append(
        el("span", categoryLabels[message.category]),
        badge(
          message.statusText || messageLabels[message.status],
          message.status === "resolved" ? "operational" : message.severity,
        ),
      );
      card.append(meta, el("h3", message.title), el("p", message.summary));
      if (message.affectedServices.length) {
        const names = message.affectedServices.map(
          (id) =>
            data?.services.find((service) => service.id === id)?.name || id,
        );
        card.append(
          el("p", `Betroffene Dienste: ${names.join(", ")}`, "affected"),
        );
      }
      const dates = el("div", "", "message-dates");
      for (const [label, value] of [
        ["Beginn", message.startsAt],
        ["Voraussichtliches Ende", message.expectedEndAt],
        ["Abgeschlossen", message.resolvedAt],
        ["Aktualisiert", message.updatedAt],
      ]) {
        if (value) dates.append(el("span", `${label}: ${formatDate(value)}`));
      }
      card.append(dates);
      if (message.updates.length) {
        const details = el("details");
        details.dataset.id = message.id;
        details.open = openIds.has(message.id);
        details.append(
          el("summary", `Verlauf ansehen (${message.updates.length})`),
        );
        const list = el("ol", "", "timeline");
        for (const update of [...message.updates].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        )) {
          const item = el("li");
          const time = el("time", formatDate(update.createdAt));
          time.dateTime = update.createdAt;
          item.append(time);
          if (update.title) item.append(el("h4", update.title));
          item.append(el("p", update.message));
          list.append(item);
        }
        details.append(list);
        card.append(details);
      }
      return card;
    });
  target.replaceChildren(
    ...(nodes.length
      ? nodes
      : [
          el(
            "p",
            id === "archive"
              ? "Noch keine vergangenen Meldungen."
              : "Aktuell liegen keine Meldungen vor.",
            "empty",
          ),
        ]),
  );
}
async function load() {
  if (pending) return;
  clearTimeout(timer);
  pending = true;
  renderCountdown();
  refresh.disabled = true;
  refresh.setAttribute("aria-busy", "true");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = parseStatus(await response.json());
    if (data && Date.parse(next.generatedAt) < Date.parse(data.generatedAt))
      throw new Error("Veraltete Antwort");
    data = next;
    failed = false;
    renderServices();
    renderMessages("messages", data.messages.current);
    renderMessages("archive", data.messages.archive);
    get("interval").textContent =
      `Aktualisierung alle ${pollDelay(data) / 1000} Sekunden`;
  } catch {
    failed = true;
    if (!data) {
      get("overall-title").textContent = "Status derzeit nicht verfügbar";
      get("overall-message").textContent =
        "Die Statusinformationen konnten nicht geladen werden. Wir versuchen es automatisch erneut.";
      for (const id of ["services", "messages", "archive"])
        get(id).replaceChildren(
          el("p", "Derzeit können keine Daten angezeigt werden.", "empty"),
        );
      announce("Status derzeit nicht verfügbar");
    }
  } finally {
    clearTimeout(timeout);
    pending = false;
    refresh.disabled = false;
    refresh.removeAttribute("aria-busy");
    renderOverview();
    nextRefreshAt = Date.now() + pollDelay(data);
    renderCountdown();
    timer = setTimeout(load, pollDelay(data));
  }
}
refresh.addEventListener("click", load);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    renderOverview();
    void load();
  }
});
window.addEventListener("online", () => void load());
setInterval(() => {
  renderOverview();
  renderCountdown();
}, 1000);
void load();
