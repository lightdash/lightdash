import { buildAccount } from './account.mock';
import { serializeAccount } from './serializeAccount';

describe('serializeAccount', () => {
    test('embed account keeps only what the app needs to render', () => {
        const account = buildAccount({ accountType: 'jwt' });
        const { ability: _ability, ...user } = account.user;

        const serialized = serializeAccount({
            ...account,
            embedWriteContext: {
                canUpdateDashboard: true,
                canUpdateSavedChart: false,
                canCreateSavedChart: false,
                canUseAiAgent: false,
            },
        });

        expect(serialized).toEqual({
            organization: account.organization,
            authentication: { type: 'jwt' },
            user,
            embedWriteContext: {
                canUpdateDashboard: true,
                canUpdateSavedChart: false,
                canCreateSavedChart: false,
                canUseAiAgent: false,
            },
        });
    });

    test('embed account does not echo the token, the embed secret or the embed config', () => {
        const account = buildAccount({ accountType: 'jwt' });

        const serialized = serializeAccount(account);
        const json = JSON.stringify(serialized);

        expect(json).not.toContain(account.authentication.source);
        expect(json).not.toContain(account.embed.encodedSecret);
        expect(serialized).not.toHaveProperty('embed');
        expect(serialized).not.toHaveProperty('access');
        expect(serialized).not.toHaveProperty('requestContext');
        expect(serialized).not.toHaveProperty('embedWriteUser');
    });

    test('session account does not echo the session cookie', () => {
        const account = buildAccount({ accountType: 'session' });

        const serialized = serializeAccount(account);

        expect(serialized.authentication).toEqual({ type: 'session' });
        expect(JSON.stringify(serialized)).not.toContain(
            account.authentication.source,
        );
        expect(serialized.embedWriteContext).toBeUndefined();
    });
});
