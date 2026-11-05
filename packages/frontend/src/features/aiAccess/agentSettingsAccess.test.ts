import { describe, expect, it } from 'vitest';
import { getAgentSettingsAccess } from './agentSettingsAccess';

describe('MCP setting permission parity', () => {
    it.each(
        [false, true].flatMap((agentIdentityEnabled) =>
            [false, true].flatMap((canManageOrganization) =>
                [false, true].map((canManageOrgAiAgent) => ({
                    agentIdentityEnabled,
                    canManageOrganization,
                    canManageOrgAiAgent,
                })),
            ),
        ),
    )(
        'flag $agentIdentityEnabled organization $canManageOrganization AI $canManageOrgAiAgent',
        (input) => {
            const access = getAgentSettingsAccess({
                ...input,
                isAiAvailable: true,
            });
            const before = getAgentSettingsAccess({
                ...input,
                agentIdentityEnabled: false,
                isAiAvailable: true,
            });
            expect(access.agentsPage).toBe(
                input.agentIdentityEnabled && input.canManageOrganization,
            );
            expect(access.agentsMcp).toBe(
                input.agentIdentityEnabled &&
                    input.canManageOrganization &&
                    input.canManageOrgAiAgent,
            );
            expect(access.mcpPage).toBe(
                !input.canManageOrgAiAgent
                    ? 'hidden'
                    : access.agentsMcp
                      ? 'link'
                      : 'switch',
            );
            expect(access.agentsMcp || access.mcpPage === 'switch').toBe(
                before.mcpPage === 'switch',
            );
        },
    );
    it('does not expose either control when AI is unavailable', () => {
        expect(
            getAgentSettingsAccess({
                agentIdentityEnabled: true,
                canManageOrganization: true,
                canManageOrgAiAgent: true,
                isAiAvailable: false,
            }),
        ).toEqual({ agentsPage: true, agentsMcp: false, mcpPage: 'hidden' });
    });
});
