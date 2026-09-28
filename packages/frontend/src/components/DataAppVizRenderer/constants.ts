// Give legacy SDK bundles time to render after their first SDK message.
export const SCREENSHOT_READY_FALLBACK_MS = 8_000;

// Bundles that acknowledge rendering (`viz-rendered`) normally do so within a
// couple of frames. If the acknowledgement never arrives, a custom chart must
// not hang an entire dashboard delivery: report ready after this long.
export const RENDER_ACK_FALLBACK_MS = 20_000;
