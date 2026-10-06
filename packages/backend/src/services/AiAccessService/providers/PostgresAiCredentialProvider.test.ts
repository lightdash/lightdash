import {
    AiAccessRefusalReason,
    AiCredentialMethod,
    AiPrincipalFailureReason,
    AiSetupScriptFormat,
    UnexpectedServerError,
    WarehouseTypes,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { PostgresAiCredentialProvider } from './PostgresAiCredentialProvider';
import {
    connection,
    policy,
    principal,
} from './PostgresAiCredentialProvider.mock';
import { createAiCredentialProviderRegistry } from './registry';

const { runQuery } = vi.hoisted(() => ({ runQuery: vi.fn() }));
vi.mock('@lightdash/warehouses', () => ({
    PostgresWarehouseClient: class {
        runQuery = runQuery;
    },
}));

const provider = new PostgresAiCredentialProvider();
const mintArgs = {
    connection,
    policy,
    principal: { ...principal, secret: 'ai-password' },
    person: { userUuid: 'user', email: 'user@example.test' },
};
const assurances = [
    { kind: 'current_user_is' as const, expected: principal.ref },
];

describe('PostgresAiCredentialProvider', () => {
    beforeEach(() => vi.resetAllMocks());

    test('registers Postgres with supported capabilities', () => {
        expect(
            createAiCredentialProviderRegistry({
                lightdashConfig: lightdashConfigMock,
                userWarehouseCredentialsModel:
                    {} as UserWarehouseCredentialsModel,
            })(WarehouseTypes.POSTGRES),
        ).toBeInstanceOf(PostgresAiCredentialProvider);
        expect(provider.capabilities()).toEqual({
            warehouseType: WarehouseTypes.POSTGRES,
            principals: {
                person: {
                    available: false,
                    reason: 'Postgres has no agent-marked session. Use a group, twin or shared principal.',
                },
                twin: { available: true, method: AiCredentialMethod.KEY },
                group: { available: true, method: AiCredentialMethod.KEY },
                shared: { available: true, method: AiCredentialMethod.KEY },
            },
            transports: {
                direct: { available: true },
                procedure: {
                    available: false,
                    reason: 'The definer-rights procedure transport for Postgres is not available in this version.',
                },
            },
            setupFormat: AiSetupScriptFormat.SQL,
        });
    });

    test('generates a random password without public keys', async () => {
        const created = await provider.createSecret();
        expect(created).toEqual({
            secret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
            publicKey: null,
            publicKeyFingerprint: null,
        });
        expect((await provider.createSecret()).secret).not.toBe(created.secret);
    });

    test('refuses a principal without a secret', async () => {
        await expect(
            provider.mint({ ...mintArgs, principal }),
        ).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.PRINCIPAL_PENDING },
        });
    });

    test('changes login credentials and preserves connection settings', async () => {
        const secured = {
            ...connection,
            sslmode: 'require',
            sshTunnelPrivateKey: 'ssh-key',
            requireUserCredentials: true,
        };
        expect(
            await provider.mint({ ...mintArgs, connection: secured }),
        ).toEqual({
            credentials: {
                ...secured,
                user: principal.ref,
                password: 'ai-password',
                requireUserCredentials: false,
            },
            assurances,
            expiresAt: null,
        });
    });

    test('proves both session and current user', async () => {
        runQuery.mockResolvedValue({
            rows: [
                { session_user: principal.ref, current_user: principal.ref },
            ],
        });
        expect(await provider.probe(connection, assurances)).toEqual({
            ok: true,
            checkedAt: expect.any(Date),
            observed: {
                session_user: principal.ref,
                current_user: principal.ref,
            },
        });
        expect(runQuery).toHaveBeenCalledWith(
            'SELECT session_user AS session_user, current_user AS current_user',
            {},
        );
    });

    test.each([
        { session_user: principal.ref, current_user: 'other' },
        { session_user: 'other', current_user: principal.ref },
        { session_user: null, current_user: null },
    ])('refuses mismatched users: %s', async (observed) => {
        runQuery.mockResolvedValue({ rows: [observed] });
        expect(await provider.probe(connection, assurances)).toMatchObject({
            ok: false,
            reason: AiPrincipalFailureReason.WRONG_PRINCIPAL,
            message: `Postgres signed in as ${observed.session_user}, not ${principal.ref}.`,
            observed,
        });
    });

    test.each([
        [
            'password authentication failed',
            AiPrincipalFailureReason.CREDENTIAL_REJECTED,
        ],
        [
            'role "ai_missing" does not exist',
            AiPrincipalFailureReason.CREDENTIAL_REJECTED,
        ],
        [
            'role "ai" is not permitted to log in',
            AiPrincipalFailureReason.DISABLED_OR_LOCKED,
        ],
        ['no pg_hba.conf entry', AiPrincipalFailureReason.NETWORK_POLICY],
        [
            'permission denied for database',
            AiPrincipalFailureReason.WAREHOUSE_ACCESS,
        ],
        ['connection refused', AiPrincipalFailureReason.UNKNOWN],
    ])('classifies %s and redacts the password', async (message, reason) => {
        runQuery.mockRejectedValue(
            new Error(`${message}: ${connection.password}`),
        );
        const result = await provider.probe(connection, assurances);
        expect(result).toMatchObject({
            ok: false,
            reason,
            checkedAt: expect.any(Date),
        });
        if (result.ok) throw new Error('Expected a failed probe');
        expect(result.message).toContain(message);
        expect(result.message).not.toContain(connection.password);
    });

    test('throws for unsupported assurances', async () => {
        await expect(
            provider.probe(connection, [{ kind: 'agent_session_active' }]),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
        expect(runQuery).not.toHaveBeenCalled();
    });

    test('requires a principal for setup', () => {
        expect(() =>
            provider.setupScript({ ...mintArgs, principal: null }),
        ).toThrow(
            'This warehouse needs a principal to build the setup script.',
        );
    });

    test('quotes identifiers and password literals in setup SQL', () => {
        const script = provider.setupScript({
            ...mintArgs,
            principal: { ...principal, ref: 'ai"role', secret: "pass'word" },
            connection: {
                ...connection,
                schema: 'data"schema',
                dbname: 'db"name',
            },
        });
        expect(script.format).toBe(AiSetupScriptFormat.SQL);
        expect(script.parts[0].body).toContain(
            'CREATE ROLE "ai""role" LOGIN NOINHERIT PASSWORD \'pass\'\'word\';',
        );
        expect(script.parts[0].body).toContain(
            'GRANT CONNECT ON DATABASE "db""name" TO "ai""role";',
        );
        expect(script.parts[1].body).toContain(
            'GRANT USAGE ON SCHEMA "data""schema" TO "ai""role";',
        );
        expect(script.parts[1].body).toContain(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA "data""schema" GRANT SELECT ON TABLES TO "ai""role";',
        );
    });

    test('shows a placeholder without a secret', () => {
        expect(
            provider.setupScript({ ...mintArgs, principal }).parts[0].body,
        ).toContain("PASSWORD '<generated when the principal is first used>'");
    });
});
