import { describe, expect, it } from 'vitest';
import {
    getAgentOptions,
    shouldShowProjectDefaultBadge,
    type Agent,
} from './AgentSelectorUtils';

const agents: Agent[] = [
    { uuid: 'agent-1', name: 'Agent One', imageUrl: null },
    { uuid: 'agent-2', name: 'Agent Two', imageUrl: null },
];

describe('getAgentOptions', () => {
    it('marks project and user defaults on the correct agents', () => {
        const options = getAgentOptions(agents, 'agent-1', 'agent-2');

        expect(options).toEqual([
            expect.objectContaining({
                value: 'agent-1',
                isProjectDefault: true,
                isUserDefault: false,
            }),
            expect.objectContaining({
                value: 'agent-2',
                isProjectDefault: false,
                isUserDefault: true,
            }),
        ]);
    });

    it('leaves flags unset when no defaults are configured', () => {
        const options = getAgentOptions(agents, null, null);

        expect(options.every((option) => !option.isProjectDefault)).toBe(true);
        expect(options.every((option) => !option.isUserDefault)).toBe(true);
    });
});

describe('shouldShowProjectDefaultBadge', () => {
    it('shows the badge for a project default that is not the user default', () => {
        const [projectDefaultOption] = getAgentOptions(
            agents,
            'agent-1',
            'agent-2',
        );

        expect(shouldShowProjectDefaultBadge(projectDefaultOption)).toBe(true);
    });

    it('hides the badge when the user default is the same agent', () => {
        const [sameDefaultOption] = getAgentOptions(
            agents,
            'agent-1',
            'agent-1',
        );

        expect(shouldShowProjectDefaultBadge(sameDefaultOption)).toBe(false);
    });

    it('hides the badge when no project default is set', () => {
        const [option] = getAgentOptions(agents, null, 'agent-2');

        expect(shouldShowProjectDefaultBadge(option)).toBe(false);
    });
});
