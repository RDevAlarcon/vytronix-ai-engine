import assert from "node:assert/strict";
import { LinuxThermalReader, parseMillidegreeCelsius, type ThermalReader } from "@/ai/runtime/thermal-reader";
import { ProductionThermalGate } from "@/ai/runtime/thermal-gate";

const config = { enabled: true, startThresholdC: 65, resumeThresholdC: 60, hardThresholdC: 70, recheckMs: 5, maxWaitMs: 20 };

function sequenceReader(values: Array<number | Error>): ThermalReader {
  return {
    getTemperatureC: async () => {
      const value = values.shift();
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error("missing test temperature");
      return value;
    }
  };
}

function immediateSleep(calls: number[] = []) {
  return async (ms: number, signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    calls.push(ms);
  };
}

async function main() {
  assert.equal(parseMillidegreeCelsius("60900\n"), 60.9);
  assert.throws(() => parseMillidegreeCelsius("hot"));
  assert.throws(() => parseMillidegreeCelsius("-1"));
  assert.throws(() => parseMillidegreeCelsius("130000"));

  const files = new Map<string, string>([
    ["/sys/class/hwmon/hwmon0/name", "amdgpu\n"],
    ["/sys/class/hwmon/hwmon1/name", "acpitz\n"],
    ["/sys/class/hwmon/hwmon3/name", "k10temp\n"],
    ["/sys/class/hwmon/hwmon3/temp1_input", "60900\n"]
  ]);
  const reader = new LinuxThermalReader({
    readDir: async () => ["hwmon0", "hwmon1", "hwmon3"],
    readText: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing ${path}`);
      return value;
    }
  });
  assert.equal(await reader.getTemperatureC(), 60.9);

  const absent = new LinuxThermalReader({ readDir: async () => ["hwmon0"], readText: async () => "amdgpu\n" });
  await assert.rejects(() => absent.getTemperatureC());

  const inputAbsent = new LinuxThermalReader({
    readDir: async () => ["hwmon3"],
    readText: async (path) => {
      if (path.endsWith("name")) return "k10temp\n";
      throw new Error("input missing");
    }
  });
  await assert.rejects(() => inputAbsent.getTemperatureC());

  const readError = new LinuxThermalReader({ readDir: async () => { throw new Error("read error"); } });
  await assert.rejects(() => readError.getTemperatureC());

  assert.equal((await new ProductionThermalGate(config, sequenceReader([55]), immediateSleep()).waitUntilSafe()).reason, "ok");
  assert.equal((await new ProductionThermalGate(config, sequenceReader([65]), immediateSleep()).waitUntilSafe()).allowed, true);

  const hysteresisSleeps: number[] = [];
  const hysteresis = await new ProductionThermalGate(config, sequenceReader([66, 64, 63, 61, 60]), immediateSleep(hysteresisSleeps)).waitUntilSafe();
  assert.deepEqual(hysteresisSleeps, [5, 5, 5, 5]);
  assert.deepEqual({ allowed: hysteresis.allowed, reason: hysteresis.reason, temperatureC: hysteresis.temperatureC, waitedMs: hysteresis.waitedMs }, { allowed: true, reason: "cooled_down", temperatureC: 60, waitedMs: 20 });

  const hard = await new ProductionThermalGate(config, sequenceReader([72, 66, 63, 60]), immediateSleep()).waitUntilSafe();
  assert.equal(hard.reason, "cooled_down");
  assert.equal(hard.temperatureC, 60);

  const timeout = await new ProductionThermalGate(config, sequenceReader([66, 66, 66, 66, 66]), immediateSleep()).waitUntilSafe();
  assert.equal(timeout.allowed, false);
  assert.equal(timeout.reason, "thermal_timeout");
  assert.equal((await new ProductionThermalGate(config, sequenceReader([66, 66]), immediateSleep()).waitUntilSafe({ maxWaitMs: 5 })).waitedMs, 5);

  assert.equal((await new ProductionThermalGate(config, sequenceReader([new Error("sensor failure")]), immediateSleep()).waitUntilSafe()).reason, "measurement_failed");
  assert.equal((await new ProductionThermalGate(config, sequenceReader([66, new Error("sensor failure")]), immediateSleep()).waitUntilSafe()).reason, "measurement_failed");
  assert.equal((await new ProductionThermalGate({ ...config, enabled: false }, sequenceReader([new Error("should not read")]), immediateSleep()).waitUntilSafe()).reason, "disabled");

  const abortController = new AbortController();
  const abortingSleep = async (_ms: number, signal?: AbortSignal) => {
    abortController.abort();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };
  const aborted = await new ProductionThermalGate(config, sequenceReader([66]), abortingSleep).waitUntilSafe({ signal: abortController.signal });
  assert.equal(aborted.reason, "aborted");

  assert.throws(() => new ProductionThermalGate({ ...config, resumeThresholdC: 65 }));
  assert.throws(() => new ProductionThermalGate({ ...config, startThresholdC: 70 }));
  assert.throws(() => new ProductionThermalGate({ ...config, recheckMs: 0 }));
  assert.throws(() => new LinuxThermalReader({ hwmonName: "../k10temp" }));

  console.log("Thermal gate checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
