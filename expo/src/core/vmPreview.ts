export type PreviewFrame = { id: number; uri: string };
export type PreviewState = { frames: PreviewFrame[]; visible?: number; width: number; height: number };

/** One capture/decode at a time, retaining the decoded frame until its replacement
 * is ready. Native images are keyed by frame ID so promoting a frame never reloads it. */
export function createVmPreview(options: {
  capture: (signal: AbortSignal) => Promise<string>;
  changed: (state: PreviewState) => void;
  error: (error?: unknown) => void;
}) {
  const controller = new AbortController();
  let state: PreviewState = { frames: [], width: 0, height: 0 };
  let sequence = 0;
  let running = false;
  let requested = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let decoding: { id: number; finish: (error?: Error) => void } | undefined;
  const stopped = () => controller.signal.aborted;
  const run = async () => {
    if (stopped() || running) return;
    clearTimeout(timer);
    running = true; requested = false;
    const started = Date.now();
    let failed = false;
    try {
      const uri = await options.capture(controller.signal);
      if (stopped()) return;
      if (state.frames.find(frame => frame.id === state.visible)?.uri !== uri) {
        const frame = { id: ++sequence, uri };
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => decoding?.finish(new Error('Could not display the VM screen.')), 5000);
          decoding = { id: frame.id, finish: error => {
            clearTimeout(timeout); decoding = undefined;
            if (error) reject(error); else resolve();
          } };
          state = { ...state, frames: [...state.frames, frame] };
          options.changed(state);
        });
      }
      if (!stopped()) options.error();
    } catch (error) {
      failed = true;
      if (!stopped()) {
        state = { ...state, frames: state.frames.filter(frame => frame.id === state.visible) };
        options.changed(state); options.error(error);
      }
    } finally {
      running = false;
      // Target up to 8 fps, accounting for capture and decode time. Slow hosts
      // never queue captures; failures back off instead of hammering the server.
      if (!stopped()) timer = setTimeout(() => { void run(); }, failed ? 1000 : requested ? 0 : Math.max(0, 125 - (Date.now() - started)));
    }
  };
  return {
    refresh() {
      if (stopped()) return;
      if (running) requested = true;
      else void run();
    },
    loaded(id: number, width: number, height: number) {
      if (stopped() || decoding?.id !== id) return;
      if (width <= 0 || height <= 0) { decoding.finish(new Error('Could not display the VM screen.')); return; }
      state = { frames: state.frames.filter(frame => frame.id === id), visible: id, width, height };
      options.changed(state);
      decoding.finish();
    },
    failed(id: number) {
      if (!stopped() && decoding?.id === id) decoding.finish(new Error('Could not display the VM screen.'));
    },
    stop() {
      controller.abort(); clearTimeout(timer);
      decoding?.finish(new Error('Preview closed.'));
    },
  };
}
