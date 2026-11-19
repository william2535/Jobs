import test from "node:test";
import assert from "node:assert/strict";
import {
  mobileWorkspaceSummary,
  recordedTimeLabel,
} from "../src/mobile-shell.js";

test("mobile dashboard counts only recorded completion, appointments and work time", () => {
  const state = {
    sites: [],
    jobs: [
      {
        id: "open",
        status: "Open",
        visitDate: "2026-11-13",
        results: [{ state: "Satisfactory" }],
        workflow: {
          tasks: [{ complete: true }],
          appointments: [
            { date: "2026-11-12", start: "09:00", end: "10:00" },
            { date: "2026-11-13", start: "10:00", end: "11:00" },
          ],
          timesheets: [
            { date: "2026-11-13", hours: 1.25 },
            { date: "2026-11-12", hours: 2.5 },
          ],
          products: [
            { id: "p1", description: "Battery", quantity: 2, complete: false },
          ],
        },
      },
      {
        id: "done",
        status: "Complete",
        visitDate: "2026-11-11",
        workflow: {
          appointments: [{ date: "2026-11-11" }],
          timesheets: [{ date: "2026-11-13", hours: 0.5 }],
        },
      },
      { id: "future", status: "In progress", visitDate: "2026-11-14" },
      { id: "past-manual", status: "Open", visitDate: "2026-11-10" },
    ],
  };
  const before = structuredClone(state);
  const summary = mobileWorkspaceSummary(state, "2026-11-13");
  assert.equal(summary.total, 4);
  assert.equal(
    summary.completed,
    1,
    "Passing devices and completing work actions do not complete a job",
  );
  assert.equal(summary.open, 3);
  assert.equal(summary.overdue, 2);
  assert.deepEqual(summary.overdueIds, ["open", "past-manual"]);
  assert.equal(summary.todayAppointments, 1);
  assert.equal(summary.todayMinutes, 105);
  assert.equal(summary.totalMinutes, 255);
  assert.equal(recordedTimeLabel(summary.todayMinutes), "1:45");
  assert.equal(summary.products.length, 1);
  assert.equal(summary.products[0].entry.complete, false);
  assert.deepEqual(state, before);
});

test("empty workspace has no fabricated progress or time and missing workflow remains supported", () => {
  const empty = mobileWorkspaceSummary({ sites: [], jobs: [] }, "2026-11-13");
  assert.equal(empty.total, 0);
  assert.equal(empty.completed, 0);
  assert.equal(empty.todayMinutes, 0);
  assert.equal(empty.overdue, 0);
  assert.deepEqual(empty.products, []);
  assert.equal(recordedTimeLabel(0), "0:00");
  const manual = mobileWorkspaceSummary(
    { jobs: [{ id: "manual", status: "Open" }] },
    "2026-11-13",
  );
  assert.equal(manual.total, 1);
  assert.equal(manual.completed, 0);
  assert.equal(manual.totalMinutes, 0);
});

test("recorded hours take precedence and elapsed time fallback does not invent negative work", () => {
  const state = {
    jobs: [
      {
        id: "times",
        status: "Open",
        workflow: {
          timesheets: [
            { date: "2026-11-13", start: "09:00", end: "11:00", hours: 1.5 },
            { date: "2026-11-13", start: "12:30", end: "13:15" },
            { date: "2026-11-13", start: "14:00", end: "13:00" },
            { date: "2026-11-13", hours: NaN },
          ],
        },
      },
    ],
  };
  const summary = mobileWorkspaceSummary(state, "2026-11-13");
  assert.equal(summary.todayMinutes, 135);
  assert.equal(recordedTimeLabel(summary.todayMinutes), "2:15");
  assert.equal(recordedTimeLabel(30 * 60 + 5), "30:05");
});
