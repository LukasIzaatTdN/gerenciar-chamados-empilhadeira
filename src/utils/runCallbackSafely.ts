export function runCallbackSafely(callback: (() => void) | undefined, context: string): void {
  if (!callback) return;

  try {
    callback();
  } catch (error) {
    console.error(`Callback failed after ${context}.`, error);
  }
}