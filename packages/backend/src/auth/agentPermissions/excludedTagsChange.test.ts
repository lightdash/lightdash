import { ForbiddenError, type Account } from '@lightdash/common';
import { assertExcludedTagsChangedByPerson } from './excludedTagsChange';

const account = (authentication: object) =>
    ({ authentication }) as unknown as Account;

describe('assertExcludedTagsChangedByPerson', () => {
    const agentConnection = account({
        type: 'oauth',
        agentConnectionGrant: { grantUuid: 'grant' },
    });

    it('refuses an agent connection that changes excluded tags', () => {
        expect(() =>
            assertExcludedTagsChangedByPerson(agentConnection, true),
        ).toThrow(ForbiddenError);
    });

    it.each([
        ['an agent connection that leaves them alone', agentConnection, false],
        ['a person session', account({ type: 'session' }), true],
        [
            'a personal OAuth token',
            account({ type: 'oauth', agentConnectionGrant: null }),
            true,
        ],
    ])('allows %s', (_case, caller, changing) => {
        expect(() =>
            assertExcludedTagsChangedByPerson(caller, changing),
        ).not.toThrow();
    });
});
