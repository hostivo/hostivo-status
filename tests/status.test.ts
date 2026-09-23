import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStatus,
  isStale,
  pollDelay,
  statuses,
} from "../src/lib/status.ts";
const now = Date.parse("2026-09-23T10:45:00+02:00");
const fixture = () => ({
  schemaVersion: 1,
  generatedAt: new Date(now).toISOString(),
  refreshAfterSeconds: 60,
  staleAfterSeconds: 180,
  overall: {
    status: "operational",
    title: "Alles funktioniert",
    message: "Keine Störungen",
  },
  services: [
    {
      id: "email",
      name: "E-Mail",
      status: "operational",
      monitored: false,
      responseTimeMs: null,
      displayOrder: 20,
    },
  ],
  messages: { current: [], archive: [] },
});
test("supports all technical states without creating editorial messages", () => {
  for (const status of statuses) {
    const raw = fixture();
    raw.overall.status = status;
    raw.services[0].status = status;
    assert.equal(parseStatus(raw).overall.status, status);
    assert.deepEqual(parseStatus(raw).messages, { current: [], archive: [] });
  }
});
test("uses source interval, with 30 second fallback and safe timer bounds", () => {
  assert.equal(pollDelay(parseStatus(fixture())), 60000);
  assert.equal(
    pollDelay(parseStatus({ ...fixture(), refreshAfterSeconds: undefined })),
    30000,
  );
  for (const value of [-1, 0, "60", Infinity])
    assert.throws(() =>
      parseStatus({ ...fixture(), refreshAfterSeconds: value }),
    );
});
test("marks stale data and implausible future timestamps independently of fetch success", () => {
  const data = parseStatus(fixture());
  assert.equal(isStale(data, now + 180000), false);
  assert.equal(isStale(data, now + 180001), true);
  assert.equal(isStale(data, now - 61000), true);
});
test("rejects unsupported schemas, malformed nested data and timestamps without timezone", () => {
  for (const patch of [
    { schemaVersion: 2 },
    { generatedAt: "2026-09-23T10:45:00" },
    { services: [{}] },
    { messages: { current: [{}], archive: [] } },
    { overall: { status: "green" } },
  ])
    assert.throws(() => parseStatus({ ...fixture(), ...patch }));
});
test("accepts editorial lifecycle and update history without changing current/archive assignment", () => {
  const item = {
    id: "INC-1",
    severity: "danger",
    category: "incident",
    title: "Störung",
    summary: "Details",
    status: "resolved",
    affectedServices: ["email"],
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    resolvedAt: new Date(now).toISOString(),
    notification: { push: true, sentAt: null },
    updates: [{ createdAt: new Date(now).toISOString(), message: "Behoben" }],
  };
  const data = parseStatus({
    ...fixture(),
    messages: { current: [item], archive: [] },
  });
  assert.equal(data.messages.current[0].status, "resolved");
  assert.equal(data.messages.archive.length, 0);
});
