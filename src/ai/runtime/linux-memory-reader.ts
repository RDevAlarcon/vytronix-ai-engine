import { readFile } from "node:fs/promises";

export type MemoryReader = {
  getAvailableMemoryMb(): Promise<number>;
};

export class MemoryMeasurementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryMeasurementError";
  }
}

export const parseMemAvailableMb = (contents: string): number => {
  const line = contents.split(/\r?\n/).find((entry) => /^MemAvailable:\s+/.test(entry));
  if (!line) throw new MemoryMeasurementError("MemAvailable is missing");
  const match = /^MemAvailable:\s+([0-9]+)\s+kB\s*$/.exec(line);
  if (!match) throw new MemoryMeasurementError("MemAvailable has an invalid format");
  const kilobytes = Number(match[1]);
  if (!Number.isSafeInteger(kilobytes) || kilobytes < 0) throw new MemoryMeasurementError("MemAvailable has an invalid value");
  return Math.floor(kilobytes / 1024);
};

export class LinuxMemoryReader implements MemoryReader {
  constructor(private readonly meminfoPath = "/proc/meminfo") {}

  async getAvailableMemoryMb(): Promise<number> {
    let contents: string;
    try {
      contents = await readFile(this.meminfoPath, "utf8");
    } catch (error) {
      throw new MemoryMeasurementError(`Unable to read ${this.meminfoPath}: ${String(error)}`);
    }
    return parseMemAvailableMb(contents);
  }
}
