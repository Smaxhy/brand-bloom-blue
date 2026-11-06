/** Wait for cancellation to settle before allowing another scan slice. */
export function createRevealScanControl() {
  let stopped = false;
  let pending: Promise<void> | null = null;
  return {
    stop(cancel: () => Promise<unknown>): Promise<void> {
      if (pending) return pending;
      stopped = true;
      pending = Promise.resolve().then(cancel).then(() => undefined).catch((error) => {
        stopped = false;
        throw error;
      }).finally(() => { pending = null; });
      return pending;
    },
    async canContinue() {
      await pending?.catch(() => undefined);
      return !stopped;
    },
  };
}