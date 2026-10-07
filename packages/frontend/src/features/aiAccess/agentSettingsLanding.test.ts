import { describe, expect, it } from 'vitest';
import { getAgentSettingsLanding } from './agentSettingsLanding';

describe('getAgentSettingsLanding', () => {
    it.each([
        [true, true, true, 'agentDataScope'],
        [true, false, true, 'agentDataScope'],
        [true, true, false, 'agentDataScope'],
        [true, false, false, 'agentDataScope'],
        [false, true, true, 'aiRegion'],
        [false, true, false, 'aiRegion'],
        [false, false, true, 'aiAccess'],
        [false, false, false, null],
    ])(
        'selects the first reachable child for scope=%s region=%s identity=%s',
        (
            canAccessAgentDataScope,
            canAccessAiRegion,
            canManageAgentIdentity,
            page,
        ) => {
            expect(
                getAgentSettingsLanding({
                    projectUuid: 'project',
                    canAccessAgentDataScope,
                    canAccessAiRegion,
                    canManageAgentIdentity,
                }),
            ).toBe(
                page
                    ? `/generalSettings/projectManagement/project/${page}`
                    : null,
            );
        },
    );
});
