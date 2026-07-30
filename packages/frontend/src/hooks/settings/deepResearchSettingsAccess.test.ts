import { describe, expect, it } from 'vitest';
import { canAccessDeepResearchSettings } from './deepResearchSettingsAccess';

const access = (
    overrides: Partial<
        Parameters<typeof canAccessDeepResearchSettings>[0]
    > = {},
) =>
    canAccessDeepResearchSettings({
        isAiCopilotEnabledOrTrial: true,
        isDeepResearchEnabled: true,
        canManageOrgAiAgent: true,
        hasAnyAiAgentAccess: true,
        ...overrides,
    });

describe('canAccessDeepResearchSettings', () => {
    it('allows organization AI admins when Deep Research is enabled', () => {
        expect(access()).toBe(true);
    });

    it.each([
        'isAiCopilotEnabledOrTrial',
        'isDeepResearchEnabled',
        'canManageOrgAiAgent',
        'hasAnyAiAgentAccess',
    ] as const)('denies access when %s is false', (gate) => {
        expect(access({ [gate]: false })).toBe(false);
    });
});
