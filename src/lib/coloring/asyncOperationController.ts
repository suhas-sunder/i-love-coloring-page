export type AsyncOperationToken = {
  id: number;
  signal: AbortSignal;
};

export function createAsyncOperationController() {
  let nextId = 0;
  let active: { id: number; controller: AbortController } | null = null;

  return {
    start(): AsyncOperationToken | null {
      if (active) return null;
      const controller = new AbortController();
      active = { id: ++nextId, controller };
      return { id: active.id, signal: controller.signal };
    },

    isCurrent(id: number) {
      return active?.id === id && !active.controller.signal.aborted;
    },

    finish(id: number) {
      if (active?.id !== id) return false;
      active = null;
      return true;
    },

    cancel() {
      if (!active) return;
      active.controller.abort();
      active = null;
    },
  };
}
