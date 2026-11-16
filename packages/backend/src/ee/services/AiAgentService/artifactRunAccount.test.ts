import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    type RegisteredAccount,
} from '@lightdash/common';
import {
    fromApiKey,
    fromOauth,
    fromSession,
} from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { getArtifactRunAccount } from './artifactRunAccount';

const user = defaultSessionUser;
const oauth = (
    clientId: string,
    agentConnectionGrant: Parameters<typeof fromOauth>[3] = null,
) =>
    fromOauth(
        user,
        { accessToken: 'test-token', client: { id: clientId }, scope: [] },
        null,
        agentConnectionGrant,
    );

describe('getArtifactRunAccount', () => {
    it.each([
        ['a PAT', fromApiKey(user, 'test-pat')],
        ['an OAuth token from a registered app', oauth('registered-app')],
    ])("runs as the person's own %s", (_name, account) => {
        expect(getArtifactRunAccount(user, account)).toBe(account);
    });

    const agentClientIds: string[] = Object.values(AGENT_CLIENT_IDS).flatMap(
        (clientId) => (clientId === null ? [] : [clientId]),
    );

    it.each<[string, RegisteredAccount | undefined]>([
        ['no caller account', undefined],
        ['a browser session', fromSession(user)],
        [
            'a grant-bound OAuth token',
            oauth(AGENT_CLIENT_IDS[AgentActorSurface.CLI], {
                grantUuid: 'grant',
                revision: 1,
            } as Parameters<typeof fromOauth>[3]),
        ],
        ...agentClientIds.map((clientId): [string, RegisteredAccount] => [
            `an OAuth token for ${clientId}`,
            oauth(clientId),
        ]),
        [
            "another person's PAT",
            fromApiKey({ ...user, userUuid: 'other-user' }, 'other-pat'),
        ],
    ])('keeps running as the session for %s', (_name, account) => {
        const runAccount = getArtifactRunAccount(user, account);
        expect(runAccount.authentication.type).toBe('session');
        expect(runAccount.user.id).toBe(user.userUuid);
    });
});
