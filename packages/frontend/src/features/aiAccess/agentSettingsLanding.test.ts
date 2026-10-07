import { describe, expect, it } from 'vitest';
import { getAgentSettingsLanding } from './agentSettingsLanding';

describe('getAgentSettingsLanding', () => {
    it.each([
        [true, true, 'agentDataScope'],
        [true, false, 'agentDataScope'],
        [false, true, 'aiRegion'],
        [false, false, null],
    ])(
        'selects the first reachable child for scope=%s region=%s',
        (canAccessAgentDataScope, canAccessAiRegion, page) => {
            expect(
                getAgentSettingsLanding({
                    projectUuid: 'project',
                    canAccessAgentDataScope,
                    canAccessAiRegion,
                }),
            ).toBe(
                page
                    ? `/generalSettings/projectManagement/project/${page}`
                    : null,
            );
        },
    );
});
