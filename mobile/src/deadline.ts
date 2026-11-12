/** Bound the entire operation, including response-body reads, even if abort is ignored. */
export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  message: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new Error(message));
      controller.abort();
    };
    timer = setTimeout(cancel, milliseconds);
    parentSignal?.addEventListener('abort', cancel, { once: true });
    if (parentSignal?.aborted) cancel();
  });
  try {
    return await Promise.race([
      stopped,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error(message);
        return operation(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', cancel);
  }
}
