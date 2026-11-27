import { expect, it } from "vitest";
import { countdown, parseFocusSession } from "./focus-timer";

it("derives the remaining time from an absolute deadline after suspension", () => {
  expect(countdown({ minutes: 5, remainingMs: 300000, endsAt: 330000 }, 55000)).toBe(275000);
  expect(countdown({ minutes: 5, remainingMs: 300000, endsAt: 330000 }, 400000)).toBe(0);
});

it("restores a paused countdown and rejects corrupted or out-of-range storage", () => {
  expect(parseFocusSession('{"minutes":25,"remainingMs":12000,"endsAt":null}')?.remainingMs).toBe(12000);
  expect(parseFocusSession('{"minutes":3,"remainingMs":12000,"endsAt":null}')).toBeNull();
  expect(parseFocusSession('{"minutes":25,"remainingMs":-1,"endsAt":null}')).toBeNull();
  expect(parseFocusSession("broken")).toBeNull();
});
