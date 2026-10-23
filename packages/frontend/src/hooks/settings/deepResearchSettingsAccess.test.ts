import { describe, expect, it } from 'vitest';
import { canAccessDeepResearchSettings } from './deepResearchSettingsAccess';

const access = (
    overrides: Partial<
        Parameters<typeof canAccessDeepResearchSettings>[0]
    > = {},
) =>
    canAccessDeepResearchSettings({
        isAiCopilotEnabled: true,
        canManageOrgAiAgent: true,
        hasAnyAiAgentAccess: true,
        ...overrides,
    });

describe('canAccessDeepResearchSettings', () => {
    it('allows organization AI admins when AI Agents are available', () => {
        expect(access()).toBe(true);
    });

    it.each([
        'isAiCopilotEnabled',
        'canManageOrgAiAgent',
        'hasAnyAiAgentAccess',
    ] as const)('denies access when %s is false', (gate) => {
        expect(access({ [gate]: false })).toBe(false);
    });
});
