import { scheduleInterval } from "../agents/timer-wheel.js";

let waitForeverCounter = 0;

export function waitForever() {
  // Keep event loop alive via timer-wheel (which uses an unref'ed interval internally)
  // plus a pending promise that never resolves.
  const timerId = `wait-forever-${++waitForeverCounter}`;
  scheduleInterval(timerId, 1_000_000, () => {});
  return new Promise<void>(() => {
    /* never resolve */
  });
}
