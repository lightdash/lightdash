import { vi } from 'vitest';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';

/** An idle build, for surfaces under test that only read its state. */
export const buildStub = (
    overrides: Partial<DataAppVizBuildState> = {},
): DataAppVizBuildState => ({
    appUuid: null,
    startedAt: null,
    claimedVersion: null,
    isBuilding: false,
    pendingPrompt: null,
    error: null,
    send: vi.fn(),
    retry: null,
    ...overrides,
});
