import { AppError } from "@/lib/errors";

export const MAX_REQUEST_BYTES = 128 * 1024;

export const assertRequestBodySize = (raw: unknown, contentLength: string | null): void => {
  const declaredLength = contentLength ? Number(contentLength) : 0;
  const actualLength = Buffer.byteLength(JSON.stringify(raw), "utf8");

  if (!Number.isFinite(declaredLength) || declaredLength > MAX_REQUEST_BYTES || actualLength > MAX_REQUEST_BYTES) {
    throw new AppError("Request payload is too large", {
      code: "PAYLOAD_TOO_LARGE",
      status: 413
    });
  }
};
