import { LinuxThermalReader, type ThermalReader } from "./thermal-reader";

export const DEFAULT_THERMAL_START_THRESHOLD_C = 65;
export const DEFAULT_THERMAL_RESUME_THRESHOLD_C = 60;
export const DEFAULT_THERMAL_HARD_THRESHOLD_C = 70;
export const DEFAULT_THERMAL_RECHECK_MS = 5_000;
export const DEFAULT_THERMAL_MAX_WAIT_MS = 60_000;

export type ThermalGateReason =
  | "ok"
  | "cooled_down"
  | "thermal_timeout"
  | "measurement_failed"
  | "disabled"
  | "aborted";

export type ThermalGateResult = {
  allowed: boolean;
  temperatureC: number | null;
  startThresholdC: number;
  resumeThresholdC: number;
  hardThresholdC: number;
  waitedMs: number;
  reason: ThermalGateReason;
};

export type ThermalGateConfig = {
  enabled?: boolean;
  startThresholdC?: number;
  resumeThresholdC?: number;
  hardThresholdC?: number;
  recheckMs?: number;
  maxWaitMs?: number;
};

export type ThermalGateSleep = (ms: number, signal?: AbortSignal) => Promise<void>;

type RuntimeThermalGateConfig = {
  enabled: boolean;
  startThresholdC: number;
  resumeThresholdC: number;
  hardThresholdC: number;
  recheckMs: number;
  maxWaitMs: number;
};

export class ProductionThermalGate {
  private readonly config: RuntimeThermalGateConfig;

  constructor(
    config: ThermalGateConfig = {},
    private readonly reader: ThermalReader = new LinuxThermalReader(),
    private readonly sleep: ThermalGateSleep = sleepWithAbort
  ) {
    this.config = validateThermalConfig({
      enabled: config.enabled ?? true,
      startThresholdC: config.startThresholdC ?? DEFAULT_THERMAL_START_THRESHOLD_C,
      resumeThresholdC: config.resumeThresholdC ?? DEFAULT_THERMAL_RESUME_THRESHOLD_C,
      hardThresholdC: config.hardThresholdC ?? DEFAULT_THERMAL_HARD_THRESHOLD_C,
      recheckMs: config.recheckMs ?? DEFAULT_THERMAL_RECHECK_MS,
      maxWaitMs: config.maxWaitMs ?? DEFAULT_THERMAL_MAX_WAIT_MS
    });
  }

  async waitUntilSafe(options: { signal?: AbortSignal; maxWaitMs?: number } = {}): Promise<ThermalGateResult> {
    if (!this.config.enabled) {
      return this.result(true, null, 0, "disabled");
    }

    if (options.signal?.aborted) {
      return this.result(false, null, 0, "aborted");
    }

    let waitedMs = 0;
    const maxWaitMs = options.maxWaitMs === undefined ? this.config.maxWaitMs : Math.min(this.config.maxWaitMs, Math.max(0, options.maxWaitMs));
    const initial = await this.measure();
    if (initial === null) return this.result(false, null, waitedMs, "measurement_failed");
    if (initial <= this.config.startThresholdC) return this.result(true, initial, waitedMs, "ok");

    let lastTemperature = initial;
    while (waitedMs < maxWaitMs) {
      const waitMs = Math.min(this.config.recheckMs, maxWaitMs - waitedMs);
      const slept = await this.sleepSafely(waitMs, options.signal);
      if (!slept) return this.result(false, lastTemperature, waitedMs, "aborted");
      waitedMs += waitMs;

      const current = await this.measure();
      if (current === null) return this.result(false, null, waitedMs, "measurement_failed");
      lastTemperature = current;
      if (current <= this.config.resumeThresholdC) return this.result(true, current, waitedMs, "cooled_down");
    }

    return this.result(false, lastTemperature, waitedMs, "thermal_timeout");
  }

  private async measure(): Promise<number | null> {
    try {
      const temperatureC = await this.reader.getTemperatureC();
      return Number.isFinite(temperatureC) && temperatureC >= 0 && temperatureC <= 125 ? temperatureC : null;
    } catch {
      return null;
    }
  }

  private async sleepSafely(ms: number, signal?: AbortSignal): Promise<boolean> {
    try {
      await this.sleep(ms, signal);
      return !signal?.aborted;
    } catch {
      return false;
    }
  }

  private result(allowed: boolean, temperatureC: number | null, waitedMs: number, reason: ThermalGateReason): ThermalGateResult {
    return {
      allowed,
      temperatureC,
      startThresholdC: this.config.startThresholdC,
      resumeThresholdC: this.config.resumeThresholdC,
      hardThresholdC: this.config.hardThresholdC,
      waitedMs,
      reason
    };
  }
}

export function validateThermalConfig(config: RuntimeThermalGateConfig): RuntimeThermalGateConfig {
  const temperatures = [config.resumeThresholdC, config.startThresholdC, config.hardThresholdC];
  if (!temperatures.every((value) => Number.isFinite(value) && value >= 0 && value <= 125)) {
    throw new Error("Thermal thresholds must be finite Celsius values from 0 to 125");
  }
  if (!(config.resumeThresholdC < config.startThresholdC && config.startThresholdC < config.hardThresholdC)) {
    throw new Error("Thermal thresholds must satisfy resume < start < hard");
  }
  if (!Number.isSafeInteger(config.recheckMs) || config.recheckMs <= 0) {
    throw new Error("Thermal recheck interval must be a positive integer");
  }
  if (!Number.isSafeInteger(config.maxWaitMs) || config.maxWaitMs <= 0) {
    throw new Error("Thermal max wait must be a positive integer");
  }
  return config;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Thermal wait aborted", "AbortError"));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);

    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Thermal wait aborted", "AbortError"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}
