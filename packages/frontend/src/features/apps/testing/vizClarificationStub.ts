import { vi } from 'vitest';
import { type VizClarification } from '../hooks/useVizClarification';

/** A clarifying round with nothing on screen. */
export const clarificationStub = (
    overrides: Partial<VizClarification> = {},
): VizClarification => ({
    pending: null,
    answers: [],
    clarifyingPrompt: null,
    fellThrough: false,
    send: vi.fn(),
    answer: vi.fn(),
    build: vi.fn(),
    abandon: vi.fn(() => null),
    reset: vi.fn(),
    ...overrides,
});
