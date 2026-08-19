import { vi } from 'vitest';
import { type ClarificationRound } from '../../apps/hooks/useClarificationRound';
import { type VizBuildRequest } from '../hooks/useDataAppVizBuild';

/** A clarifying round with nothing on screen. */
export const clarificationStub = (
    overrides: Partial<ClarificationRound<VizBuildRequest>> = {},
): ClarificationRound<VizBuildRequest> => ({
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
