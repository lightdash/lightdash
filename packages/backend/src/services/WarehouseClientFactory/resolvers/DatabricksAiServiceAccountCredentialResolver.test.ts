import {
    DatabricksAuthenticationType,
    WarehouseTypes,
    type CreateDatabricksCredentials,
} from '@lightdash/common';
import { exchangeDatabricksOAuthCredentials } from '@lightdash/warehouses';
import {
    parseAiServiceAccountSecrets,
    type AiServiceAccountSecrets,
} from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../ConnectionContext';
import { type CredentialSelection } from '../CredentialResolver';
import { BigqueryAiServiceAccountCredentialResolver } from './BigqueryAiServiceAccountCredentialResolver';
import { DatabricksAiServiceAccountCredentialResolver } from './DatabricksAiServiceAccountCredentialResolver';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    exchangeDatabricksOAuthCredentials: vi.fn(),
}));

const secrets = {
    type: WarehouseTypes.DATABRICKS,
    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
    oauthClientId: 'slot-id',
    oauthClientSecret: ' slot-secret ',
} as const;
const selection = (): CredentialSelection<
    CreateDatabricksCredentials,
    AiServiceAccountSecrets
> => ({
    connection: {
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'workspace.example.com',
        httpPath: '/sql/warehouse',
        catalog: 'catalog',
        database: 'schema',
        compute: [],
        startOfWeek: 1,
        dataTimezone: 'Europe/London',
        authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
        oauthClientId: 'project-id',
        oauthClientSecret: 'project-secret',
        token: 'person-access',
        refreshToken: 'person-refresh',
        personalAccessToken: 'project-pat',
        requireUserCredentials: true,
    },
    stored: secrets,
    owner: {
        kind: 'aiServiceAccount',
        uuid: 'slot',
        identityUuid: 'generation',
        sourceProjectUuid: 'parent',
    },
    context: connectionContextFromUser(
        { userUuid: 'person' },
        { organizationUuid: 'org', queryContext: null },
    ),
    projectUuid: 'preview',
    warehouseConnectionUuid: null,
    credentialKind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
    aiPlan: null,
});
const resolver = new DatabricksAiServiceAccountCredentialResolver();
beforeEach(() => {
    vi.mocked(exchangeDatabricksOAuthCredentials)
        .mockReset()
        .mockResolvedValue({ accessToken: 'minted', refreshToken: 'discard' });
});

it('constructs only routing and slot identity from a hostile connection', () => {
    expect(resolver.buildCredentials(selection().connection, secrets)).toEqual({
        ...secrets,
        serverHostName: 'workspace.example.com',
        httpPath: '/sql/warehouse',
        catalog: 'catalog',
        database: 'schema',
        compute: [],
        startOfWeek: 1,
        dataTimezone: 'Europe/London',
        requireUserCredentials: false,
    });
});
it('mints each materialization from the slot and routing host without caching or refresh tokens', async () => {
    const first = await resolver.resolve(selection());
    const second = await resolver.resolve(selection());
    for (const result of [first, second]) {
        expect(result).toEqual({
            clientCredentials: {
                ...resolver.buildCredentials(selection().connection, secrets),
                token: 'minted',
            },
            clientOptions: {},
            cacheable: false,
        });
    }
    expect(exchangeDatabricksOAuthCredentials).toHaveBeenCalledTimes(2);
    expect(exchangeDatabricksOAuthCredentials).toHaveBeenLastCalledWith(
        'workspace.example.com',
        'slot-id',
        ' slot-secret ',
    );
});
it.each(['', '  ', undefined])(
    'refuses an empty token %s',
    async (accessToken) => {
        vi.mocked(exchangeDatabricksOAuthCredentials).mockResolvedValue({
            accessToken: accessToken as string,
        });
        await expect(resolver.resolve(selection())).rejects.toThrow(
            'access token',
        );
    },
);
it('validates without exchanging credentials and preserves secret bytes', async () => {
    expect(
        await resolver.validateOnSave({
            ...selection(),
            intent: { kind: 'preserve' },
        }),
    ).toEqual({ connection: selection().connection, stored: secrets });
    expect(exchangeDatabricksOAuthCredentials).not.toHaveBeenCalled();
});
it.each([
    'token',
    'refreshToken',
    'personalAccessToken',
    'serverHostName',
    'catalog',
    'unknown',
])('rejects the stored field %s', (field) => {
    expect(() =>
        parseAiServiceAccountSecrets({ ...secrets, [field]: 'hostile' }),
    ).toThrow();
});
it.each([
    { oauthClientId: '  ' },
    { oauthClientSecret: '\t' },
    { authenticationType: DatabricksAuthenticationType.OAUTH_U2M },
    { authenticationType: DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN },
])('rejects incomplete or personal identity %j', (change) => {
    expect(() =>
        parseAiServiceAccountSecrets({ ...secrets, ...change }),
    ).toThrow();
});
it.each([
    { kind: 'linkCurrentPerson', userUuid: 'person' },
    { kind: 'verifiedGoogleCallback', refreshToken: 'refresh' },
] as const)('refuses the $kind intent', async (intent) => {
    await expect(
        resolver.validateOnSave({ ...selection(), intent }),
    ).rejects.toThrow('person sign-in');
});
it('rejects mismatched warehouse identities in both resolvers', () => {
    const bigquery = {
        type: WarehouseTypes.BIGQUERY,
        authenticationType: 'private_key',
        keyfileContents: {
            type: 'service_account',
            private_key: 'key',
            client_email: 'agent@example.com',
        },
    } as const;
    expect(() =>
        resolver.buildCredentials(
            selection().connection,
            bigquery as AiServiceAccountSecrets,
        ),
    ).toThrow('match');
    expect(() =>
        new BigqueryAiServiceAccountCredentialResolver().buildCredentials(
            { ...bigquery, project: 'project', dataset: 'dataset' } as never,
            secrets,
        ),
    ).toThrow('match');
    expect(() =>
        resolver.buildCredentials(
            {
                ...selection().connection,
                type: WarehouseTypes.BIGQUERY,
            } as never,
            secrets,
        ),
    ).toThrow('match');
});
it('isolates generations and source projects while sharing the identity across people', () => {
    const input = selection();
    expect(resolver.cacheKeyIdentity(input)).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.DATABRICKS,
        'slot',
        'generation',
        'parent',
    ]);
    expect(resolver.cacheKeyIdentity({ ...input, owner: null })).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.DATABRICKS,
        null,
        null,
        null,
    ]);
    for (const change of [
        { uuid: 'other' },
        { identityUuid: 'other' },
        { sourceProjectUuid: 'other' },
    ]) {
        expect(
            resolver.cacheKeyIdentity({
                ...input,
                owner: {
                    kind: 'aiServiceAccount',
                    uuid: 'slot',
                    identityUuid: 'generation',
                    sourceProjectUuid: 'parent',
                    ...change,
                },
            }),
        ).not.toEqual(resolver.cacheKeyIdentity(input));
    }
    expect(
        resolver.cacheKeyIdentity({
            ...input,
            context: connectionContextFromUser(
                { userUuid: 'other' },
                { organizationUuid: 'org', queryContext: null },
            ),
        }),
    ).toEqual(resolver.cacheKeyIdentity(input));
});
it.each([
    { kind: 'project', uuid: 'project' },
    { kind: 'organization', uuid: 'org' },
    { kind: 'warehouseConnection', uuid: 'connection' },
    { kind: 'user', uuid: 'person', purpose: 'query' },
] as const)(
    'rejects the $kind owner before exchanging a token',
    async (owner) => {
        const input = { ...selection(), owner } as ReturnType<typeof selection>;
        await expect(resolver.resolve(input)).rejects.toThrow('owner');
        expect(() => resolver.cacheKeyIdentity(input)).toThrow('owner');
        expect(exchangeDatabricksOAuthCredentials).not.toHaveBeenCalled();
    },
);
