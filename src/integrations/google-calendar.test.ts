import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchTodayEvents } from "./google-calendar.js";

test("fetchTodayEvents returns warning without credentials", async () => {
  const original = { ...process.env };
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  const result = await fetchTodayEvents({ calendarIds: ["primary", "other"] });
  assert.ok(result.warning);
  assert.equal(result.events.length, 0);
  assert.equal(result.sources?.length, 2);
  process.env = original;
});
