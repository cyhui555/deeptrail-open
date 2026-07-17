export class LoopGatewayError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "LoopGatewayError";
    this.code = code;
    this.details = details;
  }
}

export function formatError(error) {
  if (error instanceof LoopGatewayError) {
    return {
      ok: false,
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    };
  }
  return {
    ok: false,
    error: "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error)
  };
}
