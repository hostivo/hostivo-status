export const statuses = [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
  "unknown",
] as const;
export type Status = (typeof statuses)[number];
export const labels: Record<Status, string> = {
  operational: "Betriebsbereit",
  degraded: "Eingeschränkt",
  partial_outage: "Teilweise Störung",
  major_outage: "Störung",
  maintenance: "Wartung",
  unknown: "Status unbekannt",
};
export interface Service {
  id: string;
  name: string;
  description?: string;
  status: Status;
  statusText?: string;
  monitored: boolean;
  checkedAt?: string | null;
  lastChangedAt?: string | null;
  responseTimeMs?: number | null;
  displayOrder: number;
}
export interface Update {
  id?: string;
  createdAt: string;
  title?: string;
  message: string;
  status?: string;
}
export interface Message {
  id: string;
  severity: "info" | "warning" | "danger";
  category: "notice" | "maintenance" | "incident";
  title: string;
  summary: string;
  status: "planned" | "open" | "in_progress" | "monitoring" | "resolved";
  statusText?: string;
  affectedServices: string[];
  createdAt: string;
  startsAt?: string | null;
  expectedEndAt?: string | null;
  updatedAt: string;
  resolvedAt?: string | null;
  archiveAt?: string | null;
  notification?: { push: boolean; sentAt: string | null };
  updates: Update[];
}
export interface StatusData {
  schemaVersion: 1;
  generatedAt: string;
  refreshAfterSeconds: number;
  staleAfterSeconds: number;
  overall: { status: Status; title: string; message: string };
  services: Service[];
  messages: { current: Message[]; archive: Message[] };
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const date = (v: unknown) =>
  str(v) &&
  /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
const optionalDate = (v: unknown) => v == null || date(v);
const optionalString = (v: unknown) => v == null || str(v);
const member = (v: unknown, values: readonly string[]) =>
  str(v) && values.includes(v);
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
function service(v: unknown): boolean {
  return (
    record(v) &&
    str(v.id) &&
    str(v.name) &&
    optionalString(v.description) &&
    member(v.status, statuses) &&
    optionalString(v.statusText) &&
    typeof v.monitored === "boolean" &&
    optionalDate(v.checkedAt) &&
    optionalDate(v.lastChangedAt) &&
    (v.responseTimeMs == null ||
      (typeof v.responseTimeMs === "number" &&
        Number.isFinite(v.responseTimeMs) &&
        v.responseTimeMs >= 0)) &&
    typeof v.displayOrder === "number" &&
    Number.isFinite(v.displayOrder)
  );
}
function message(v: unknown): boolean {
  return (
    record(v) &&
    str(v.id) &&
    member(v.severity, ["info", "warning", "danger"]) &&
    member(v.category, ["notice", "maintenance", "incident"]) &&
    str(v.title) &&
    str(v.summary) &&
    member(v.status, [
      "planned",
      "open",
      "in_progress",
      "monitoring",
      "resolved",
    ]) &&
    optionalString(v.statusText) &&
    Array.isArray(v.affectedServices) &&
    v.affectedServices.every(str) &&
    date(v.createdAt) &&
    date(v.updatedAt) &&
    ["startsAt", "expectedEndAt", "resolvedAt", "archiveAt"].every((k) =>
      optionalDate(v[k]),
    ) &&
    (v.notification == null ||
      (record(v.notification) &&
        typeof v.notification.push === "boolean" &&
        optionalDate(v.notification.sentAt))) &&
    Array.isArray(v.updates) &&
    v.updates.every(
      (u) =>
        record(u) &&
        date(u.createdAt) &&
        str(u.message) &&
        optionalString(u.title) &&
        optionalString(u.status),
    )
  );
}
export function parseStatus(value: unknown): StatusData {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !date(value.generatedAt) ||
    (value.refreshAfterSeconds != null &&
      !positive(value.refreshAfterSeconds)) ||
    !positive(value.staleAfterSeconds) ||
    !record(value.overall) ||
    !member(value.overall.status, statuses) ||
    !str(value.overall.title) ||
    !str(value.overall.message) ||
    !Array.isArray(value.services) ||
    !value.services.every(service) ||
    !record(value.messages) ||
    !Array.isArray(value.messages.current) ||
    !value.messages.current.every(message) ||
    !Array.isArray(value.messages.archive) ||
    !value.messages.archive.every(message)
  ) {
    throw new Error("Ungültiges oder nicht unterstütztes Statusformat.");
  }
  return {
    ...value,
    refreshAfterSeconds: value.refreshAfterSeconds ?? 30,
  } as StatusData;
}
export function isStale(data: StatusData, now = Date.now()): boolean {
  const age = now - Date.parse(data.generatedAt);
  return age > data.staleAfterSeconds * 1000 || age < -60_000;
}
export function pollDelay(data?: StatusData): number {
  return Math.min(
    2_147_483_647,
    Math.max(1000, (data?.refreshAfterSeconds ?? 30) * 1000),
  );
}
