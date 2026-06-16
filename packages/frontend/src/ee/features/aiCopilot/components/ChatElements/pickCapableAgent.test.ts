import { pickCapableAgent } from './pickCapableAgent';

const make = (uuid: string, name: string, enableContentTools: boolean) =>
    ({ uuid, name, enableContentTools }) as Parameters<
        typeof pickCapableAgent
    >[0]['agents'][number];

describe('pickCapableAgent', () => {
    it('returns the first content-capable agent that is not the current one, by name', () => {
        const agents = [
            make('cur', 'Current', false),
            make('b', 'Zeta', true),
            make('a', 'Alpha', true),
        ];
        expect(pickCapableAgent({ agents, currentAgentUuid: 'cur' })).toEqual({
            uuid: 'a',
            name: 'Alpha',
        });
    });

    it('returns null when no other capable agent exists', () => {
        const agents = [make('cur', 'Current', false), make('x', 'X', false)];
        expect(
            pickCapableAgent({ agents, currentAgentUuid: 'cur' }),
        ).toBeNull();
    });

    it('excludes the current agent even if it is capable', () => {
        const agents = [make('cur', 'Current', true)];
        expect(
            pickCapableAgent({ agents, currentAgentUuid: 'cur' }),
        ).toBeNull();
    });
});
