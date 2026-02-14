/**
 * Safely get a string message from an unknown error.
 * Avoids instanceof Error which can throw "Right-hand side of 'instanceof' is not an object"
 * in some environments (bundlers, workers, etc.).
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  try {
    if (err != null && typeof err === 'object' && 'message' in err) {
      const m = (err as { message: unknown }).message;
      if (typeof m === 'string') return m;
    }
  } catch {
    // ignore
  }
  return fallback;
}
