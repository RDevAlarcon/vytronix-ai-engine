import { readdir, readFile } from "node:fs/promises";
import { posix } from "node:path";

export type ThermalReader = {
  getTemperatureC(): Promise<number>;
};

export type LinuxThermalReaderOptions = {
  hwmonRoot?: string;
  hwmonName?: string;
  sensor?: string;
  readDir?: (path: string) => Promise<string[]>;
  readText?: (path: string) => Promise<string>;
};

export class ThermalMeasurementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThermalMeasurementError";
  }
}

export class LinuxThermalReader implements ThermalReader {
  private readonly hwmonRoot: string;
  private readonly hwmonName: string;
  private readonly sensor: string;
  private readonly readDir: (path: string) => Promise<string[]>;
  private readonly readText: (path: string) => Promise<string>;

  constructor(options: LinuxThermalReaderOptions = {}) {
    this.hwmonRoot = options.hwmonRoot ?? "/sys/class/hwmon";
    this.hwmonName = validateIdentifier(options.hwmonName ?? "k10temp", "hwmon name");
    this.sensor = validateIdentifier(options.sensor ?? "temp1", "thermal sensor");
    this.readDir = options.readDir ?? readdir;
    this.readText = options.readText ?? ((path) => readFile(path, "utf8"));
  }

  async getTemperatureC(): Promise<number> {
    let entries: string[];
    try {
      entries = await this.readDir(this.hwmonRoot);
    } catch (error) {
      throw new ThermalMeasurementError(`Unable to read hwmon root: ${String(error)}`);
    }

    for (const entry of entries) {
      if (!/^hwmon[0-9]+$/.test(entry)) continue;
      const directory = posix.join(this.hwmonRoot, entry);
      const name = await this.readOptionalText(posix.join(directory, "name"));
      if (name?.trim() !== this.hwmonName) continue;
      return this.readSensorInput(posix.join(directory, `${this.sensor}_input`));
    }

    throw new ThermalMeasurementError(`Thermal sensor ${this.hwmonName}/${this.sensor} was not found`);
  }

  private async readOptionalText(path: string): Promise<string | null> {
    try {
      return await this.readText(path);
    } catch {
      return null;
    }
  }

  private async readSensorInput(path: string): Promise<number> {
    let contents: string;
    try {
      contents = await this.readText(path);
    } catch (error) {
      throw new ThermalMeasurementError(`Unable to read thermal input: ${String(error)}`);
    }
    return parseMillidegreeCelsius(contents);
  }
}

export function parseMillidegreeCelsius(contents: string): number {
  const trimmed = contents.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new ThermalMeasurementError("Thermal input has an invalid format");
  }

  const millidegrees = Number(trimmed);
  if (!Number.isSafeInteger(millidegrees) || millidegrees < 0) {
    throw new ThermalMeasurementError("Thermal input has an invalid value");
  }

  const temperatureC = millidegrees / 1000;
  if (temperatureC < 0 || temperatureC > 125) {
    throw new ThermalMeasurementError("Thermal input is outside the expected physical range");
  }

  return temperatureC;
}

function validateIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}
