import assert from "node:assert/strict";
import { DEFAULT_MIN_AVAILABLE_MEMORY_MB, ProductionMemoryGate } from "@/ai/runtime/memory-gate";
import { MemoryMeasurementError, parseMemAvailableMb, type MemoryReader } from "@/ai/runtime/linux-memory-reader";

const fixture = (availableKb: string, freeKb = "200000") => `MemTotal:        7340032 kB\nMemFree:          ${freeKb} kB\nMemAvailable:    ${availableKb} kB\n`;
const reader = (value: number | Error): MemoryReader => ({ getAvailableMemoryMb: async () => { if (value instanceof Error) throw value; return value; } });

const main = async () => {
  assert.equal(parseMemAvailableMb(fixture("3800000")), 3710);
  assert.equal(parseMemAvailableMb(fixture("2048000")), 2000);
  assert.equal(parseMemAvailableMb(fixture("5120000", "5120000")), 5000);
  assert.throws(() => parseMemAvailableMb("MemFree: 5000000 kB\n"), MemoryMeasurementError);
  assert.throws(() => parseMemAvailableMb("MemAvailable: invalid kB\n"), MemoryMeasurementError);
  assert.throws(() => parseMemAvailableMb("MemAvailable: -1 kB\n"), MemoryMeasurementError);
  assert.throws(() => parseMemAvailableMb("MemAvailable: 2000 MB\n"), MemoryMeasurementError);

  const exact = await new ProductionMemoryGate(DEFAULT_MIN_AVAILABLE_MEMORY_MB, reader(2000)).check();
  assert.deepEqual(exact, { allowed: true, availableMb: 2000, thresholdMb: 2000, reason: "ok" });
  const low = await new ProductionMemoryGate(2000, reader(1999)).check();
  assert.deepEqual(low, { allowed: false, availableMb: 1999, thresholdMb: 2000, reason: "insufficient_memory" });
  assert.equal((await new ProductionMemoryGate(2000, reader(2500)).check()).allowed, true);
  assert.equal((await new ProductionMemoryGate(2500, reader(2499)).check()).allowed, false);
  assert.equal((await new ProductionMemoryGate(2000, reader(5000)).check()).availableMb, 5000);
  assert.equal((await new ProductionMemoryGate(2000, reader(new Error("read error"))).check()).reason, "measurement_failed");
  assert.equal((await new ProductionMemoryGate(2000, reader(Number.NaN)).check()).reason, "measurement_failed");
  assert.equal((await new ProductionMemoryGate(2000, reader(-1)).check()).reason, "measurement_failed");
  assert.throws(() => new ProductionMemoryGate(0, reader(2500)));
  assert.throws(() => new ProductionMemoryGate(2000.5, reader(2500)));

  const memFreeHigh = parseMemAvailableMb(fixture("1024000", "5120000"));
  assert.equal(memFreeHigh, 1000);
  assert.equal((await new ProductionMemoryGate(2000, reader(memFreeHigh)).check()).allowed, false);
  console.log("Production memory gate checks passed.");
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
