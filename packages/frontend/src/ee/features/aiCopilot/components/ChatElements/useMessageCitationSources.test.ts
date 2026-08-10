import { describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../../../testing/testUtils';
import { useMessageCitationSources } from './useMessageCitationSources';

const { memoryEnabled } = vi.hoisted(() => ({
    memoryEnabled: vi.fn(() => true),
}));

vi.mock('../../hooks/useAiOrganizationSettings', () => ({
    useAiAgentMemoryEnabled: () => memoryEnabled(),
}));

const MARKDOWN = [
    'a<ld-mem-cite id="alpha"></ld-mem-cite>',
    'b<ld-cite source="context" id="beta-3fa9c2d1"></ld-cite>',
    'c<ld-cite source="memory" id="gamma"></ld-cite>',
].join(' ');

const sources = () =>
    renderHookWithProviders(() => useMessageCitationSources(MARKDOWN)).result
        .current;

describe('useMessageCitationSources', () => {
    it('numbers both tiers in one sequence', () => {
        memoryEnabled.mockReturnValue(true);
        expect(sources()).toEqual([
            { source: 'memory', slug: 'alpha', index: 1 },
            { source: 'context', slug: 'beta-3fa9c2d1', index: 2 },
            { source: 'memory', slug: 'gamma', index: 3 },
        ]);
    });

    it('keeps project context with the memory setting off, holding marker numbers', () => {
        memoryEnabled.mockReturnValue(false);
        expect(sources()).toEqual([
            { source: 'context', slug: 'beta-3fa9c2d1', index: 2 },
        ]);
    });
});
