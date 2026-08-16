export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, options: { code: string; status?: number; details?: unknown }) {
    super(message);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.details = options.details;
  }
}

export const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};

export const toPublicError = (error: unknown): { code: string; message: string } => {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: "UNEXPECTED_ERROR", message: "Unexpected error" };
  }

  return { code: "UNEXPECTED_ERROR", message: "Unexpected error" };
};
