import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    BigqueryTokenError,
    DatabricksAuthenticationType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    ProjectType,
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseSignInRejection,
    WarehouseTypes,
    type Account,
    type CreateBigqueryCredentials,
    type CreateWarehouseCredentials,
    type SessionUser,
} from '@lightdash/common';
import { GoogleAuth } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../../models/UserModel';
import { UserOAuthGrantsModel } from '../../../models/UserOAuthGrantsModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type ConnectionBinding } from '../../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { UserService } from '../../../services/UserService';
import { WarehouseClientFactory } from '../../../services/WarehouseClientFactory/WarehouseClientFactory';
import {
    createGoogleOAuthCompatibilityHarness as createHarness,
    googleOAuthCompatibilityConfig as lightdashConfig,
} from '../../../testing/googleOAuthCompatibilityHarness.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { createPatchedPrerequisiteGoogleBackend } from '../../../testing/patchedPrerequisiteGoogleOAuth.mock';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const createGoogleOAuthCompatibilityHarness = (
    ...args: Parameters<typeof createHarness>
) =>
    createHarness(
        args[0],
        args[1],
        args[2] ?? createPatchedPrerequisiteGoogleBackend(),
        args[3],
    );

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
afterEach(() => vi.restoreAllMocks());

const fixture = async () => {
    const { database } = migrated;
    const [user] = await database('users')
        .insert({
            first_name: 'user_a',
            last_name: 'user_a',
            is_active: true,
            is_setup_complete: true,
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
        })
        .returning('*');
    const [organization] = await database('organizations')
        .insert({ organization_name: 'organization_a' })
        .returning('*');
    const featureFlagModel = new FeatureFlagModel({
        database,
        lightdashConfig,
    });
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const userModel = new UserModel({
        database,
        lightdashConfig,
        featureFlagModel,
    });
    const grants = new UserOAuthGrantsModel({
        database,
        encryptionUtil,
        userModel,
    });
    const credentials = new UserWarehouseCredentialsModel({
        database,
        encryptionUtil,
    });
    const policy = { strictPersonalOverlay: false };
    const createCredentials = (
        refreshToken: string,
    ): CreateBigqueryCredentials => ({
        type: WarehouseTypes.BIGQUERY,
        authenticationType: BigqueryAuthenticationType.SSO,
        project: 'project_a',
        dataset: 'dataset_a',
        location: undefined,
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        maximumBytesBilled: undefined,
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'client_a',
            refresh_token: refreshToken,
        },
    });
    const createAssociatedCredential = async (
        name: string,
        refreshToken: string,
    ) => {
        const [project] = await database('projects')
            .insert({
                name: 'project_a',
                organization_id: organization.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                organization_warehouse_credentials_uuid: null,
                created_by_user_uuid: null,
            })
            .returning('*');
        const uuid = await credentials.create(
            user.user_uuid,
            { name, credentials: createCredentials(refreshToken) },
            policy,
            project.project_uuid,
        );
        await database('project_user_warehouse_credentials_preference').insert({
            user_uuid: user.user_uuid,
            project_uuid: project.project_uuid,
            user_warehouse_credentials_uuid: uuid,
        });
        return uuid;
    };
    const selected = await createAssociatedCredential(
        'credential_a',
        'token_a',
    );
    const other = await createAssociatedCredential('credential_b', 'token_b');
    await grants.upsertGrant({
        userUuid: user.user_uuid,
        provider: OpenIdIdentityIssuerType.GOOGLE,
        subject: 'subject_saved',
        email: 'email_saved',
        scopes: ['scope_saved'],
        refreshToken: 'token_saved',
    });
    const service = new UserService({
        lightdashConfig,
        userModel,
        userOAuthGrantsModel: grants,
        userWarehouseCredentialsModel: credentials,
        featureFlagModel,
        analytics: { track: () => {} },
    } as unknown as ConstructorParameters<typeof UserService>[0]);
    const sessionUser = {
        userUuid: user.user_uuid,
        role: OrganizationMemberRole.ADMIN,
        userId: user.user_id,
        organizationUuid: organization.organization_uuid,
    } as SessionUser;
    const snapshot = async () =>
        JSON.stringify({
            credentials: await database('user_warehouse_credentials')
                .where({ user_uuid: user.user_uuid })
                .orderBy('user_warehouse_credentials_uuid'),
            preferences: await database(
                'project_user_warehouse_credentials_preference',
            )
                .where({ user_uuid: user.user_uuid })
                .orderBy('project_uuid'),
            grants: await database('user_oauth_grants')
                .where({ user_uuid: user.user_uuid })
                .orderBy('provider'),
            identities: await database('openid_identities')
                .where({ user_id: user.user_id })
                .orderBy('subject'),
        });
    const rows = await database('user_warehouse_credentials').where({
        user_uuid: user.user_uuid,
    });
    expect(rows.length).toBe(2);
    expect(
        rows.every(
            (row) => row.purpose === UserWarehouseCredentialPurpose.DEFAULT,
        ),
    ).toBe(true);
    return {
        database,
        user: sessionUser,
        service,
        selected,
        other,
        snapshot,
        featureFlagModel,
        credentials,
        grants,
    };
};

test.each(['selected', 'empty', 'malformed', 'foreign', 'missing-login'])(
    'old initiation rejects %s before exchange and preserves every persisted byte',
    async (kind) => {
        const f = await fixture();
        const before = await f.snapshot();
        const h = createGoogleOAuthCompatibilityHarness(
            kind === 'missing-login' ? undefined : f.user,
            f.service,
        );
        let target: string | string[] = f.selected;
        if (kind === 'empty') target = '';
        else if (kind === 'malformed') target = [f.selected, f.other];
        else if (kind === 'foreign') target = randomUUID();
        const result = await h.invoke('/login/bigquery', {
            isPopup: 'true',
            reconnect: 'true',
            personalCredentialUuid: target,
        });
        expect(new URL(result.location!).pathname).toBe('/auth/popup/failure');
        expect(h.authenticate).not.toHaveBeenCalled();
        expect(h.exchange).not.toHaveBeenCalled();
        expect((await f.snapshot()) === before).toBe(true);
    },
);

test.each(['link', undefined, 'unexpected'])(
    'old callback rejects a serialized new-personal handoff with intent %s and preserves every persisted byte',
    async (intent) => {
        const f = await fixture();
        const before = await f.snapshot();
        const h = createGoogleOAuthCompatibilityHarness(f.user, f.service);
        await h.invoke('/login/bigquery', { isPopup: 'true' });
        const data = (await h.readSession())!;
        data.oauth.googlePersonalReconnect = {
            userUuid: f.user.userUuid,
            credentialUuid: f.selected,
        };
        data.oauth.intent = intent as 'link' | undefined;
        await h.writeSession(data);
        h.authenticate.mockClear();
        const result = await h.callback();
        expect(new URL(result.location!).pathname).toBe('/auth/popup/failure');
        expect(h.authenticate).not.toHaveBeenCalled();
        expect(h.exchange).not.toHaveBeenCalled();
        expect(h.profile).not.toHaveBeenCalled();
        expect((await f.snapshot()) === before).toBe(true);
    },
);

test('normal metadata-free linking reaches the real grant and destructive default credential persistence', async () => {
    const f = await fixture();
    const before = await f.snapshot();
    const h = createGoogleOAuthCompatibilityHarness(f.user, f.service);
    const started = await h.invoke('/login/bigquery', { isPopup: 'true' });
    expect(new URL(started.location!).searchParams.get('prompt')).toBe(
        'consent',
    );
    const result = await h.callback();
    expect(new URL(result.location!).pathname).toBe('/auth/popup/success');
    expect(h.exchange).toHaveBeenCalledOnce();
    expect(h.profile).toHaveBeenCalledOnce();
    const rows = await f
        .database('user_warehouse_credentials')
        .where({ user_uuid: f.user.userUuid });
    expect(rows.length).toBe(1);
    expect(
        rows.every(
            (row) =>
                ![f.selected, f.other].includes(
                    row.user_warehouse_credentials_uuid,
                ),
        ),
    ).toBe(true);
    expect((await f.snapshot()) === before).toBe(false);
    const grant = await f
        .database('user_oauth_grants')
        .where({ user_uuid: f.user.userUuid })
        .first();
    expect(grant!.provider_subject).toBe('subject_a');
    expect(grant!.provider_email).toBe('email_a');
});

const currentHarness = (
    f: Awaited<ReturnType<typeof fixture>>,
    store?: Parameters<typeof createHarness>[3],
) => {
    vi.spyOn(f.featureFlagModel, 'get').mockImplementation(
        async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId !== FeatureFlags.AgentIdentity,
        }),
    );
    const h = createHarness(f.user, f.service, undefined, store);
    h.profile.mockImplementation((_token, done) =>
        done(null, {
            provider: 'google',
            id: 'subject_saved',
            displayName: 'user_a',
            emails: [{ value: 'email_saved', verified: true }],
        } as never),
    );
    return h;
};

test.each(['old', 'new'])(
    'a real new initiation rejects on %s callback or updates only the selected persisted row',
    async (callbackVersion) => {
        const f = await fixture();
        const h = currentHarness(f);
        const before = await f.snapshot();
        const started = await h.invoke('/login/bigquery', {
            isPopup: 'true',
            reconnect: 'true',
            personalCredentialUuid: f.selected,
        });
        const params = new URL(started.location!).searchParams;
        expect(params.has('prompt')).toBe(false);
        expect(params.get('state')).toBeTruthy();
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(
            started.session.oauth.googlePersonalReconnect?.credentialUuid,
        ).toBe(f.selected);
        const callback =
            callbackVersion === 'old'
                ? createHarness(
                      f.user,
                      f.service,
                      createPatchedPrerequisiteGoogleBackend(),
                      h.store,
                  )
                : h;
        const result = await callback.callback();
        expect(new URL(result.location!).pathname).toBe(
            `/auth/popup/${callbackVersion === 'old' ? 'failure' : 'success'}`,
        );
        if (callbackVersion === 'old') {
            expect(callback.exchange).not.toHaveBeenCalled();
            expect((await f.snapshot()) === before).toBe(true);
        } else {
            expect(h.exchange).toHaveBeenCalledOnce();
            expect(h.exchange.mock.calls[0][1]).toHaveProperty('code_verifier');
            const after = JSON.parse(await f.snapshot());
            const previous = JSON.parse(before);
            expect(after.credentials.length).toBe(2);
            expect(after.preferences).toEqual(previous.preferences);
            expect(
                after.credentials.filter(
                    (row: { user_warehouse_credentials_uuid: string }) =>
                        row.user_warehouse_credentials_uuid !== f.selected,
                ),
            ).toEqual(
                previous.credentials.filter(
                    (row: { user_warehouse_credentials_uuid: string }) =>
                        row.user_warehouse_credentials_uuid !== f.selected,
                ),
            );
            expect(
                after.credentials.find(
                    (row: { user_warehouse_credentials_uuid: string }) =>
                        row.user_warehouse_credentials_uuid === f.selected,
                ),
            ).not.toEqual(
                previous.credentials.find(
                    (row: { user_warehouse_credentials_uuid: string }) =>
                        row.user_warehouse_credentials_uuid === f.selected,
                ),
            );
            expect(
                (
                    await f.credentials.getByUuidWithSecrets(
                        f.selected,
                        undefined,
                        { strictPersonalOverlay: false },
                    )
                ).credentials,
            ).toMatchObject({
                keyfileContents: { refresh_token: 'refresh_token_a' },
            });
            expect(
                await f.grants.getRefreshToken(
                    f.user.userUuid,
                    OpenIdIdentityIssuerType.GOOGLE,
                ),
            ).toBe('refresh_token_a');
        }
    },
);

test.each(['old', 'new'])(
    'old initiation refuses a selected handoff to %s without manufacturing new metadata',
    async (callbackVersion) => {
        const f = await fixture();
        const before = await f.snapshot();
        const old = createHarness(
            f.user,
            f.service,
            createPatchedPrerequisiteGoogleBackend(),
        );
        const started = await old.invoke('/login/bigquery', {
            isPopup: 'true',
            reconnect: 'true',
            personalCredentialUuid: f.selected,
        });
        expect(new URL(started.location!).pathname).toBe('/auth/popup/failure');
        expect(started.session.oauth).not.toHaveProperty(
            'googlePersonalReconnect',
        );
        expect(old.exchange).not.toHaveBeenCalled();
        expect((await f.snapshot()) === before).toBe(true);
        if (callbackVersion === 'new') {
            const newer = currentHarness(f, old.store);
            const response = await newer.callback();
            expect(new URL(response.location!).pathname).toBe(
                '/auth/popup/failure',
            );
            expect((await f.snapshot()) === before).toBe(true);
        }
    },
);

test.each([
    'empty',
    'array',
    'object',
    'foreign',
    'missing-login',
    'not-reconnect',
    'disabled',
])(
    'the current registered initiator safely rejects %s without changing persistence',
    async (kind) => {
        const f = await fixture();
        const h = currentHarness(f);
        if (kind === 'disabled')
            vi.mocked(f.featureFlagModel.get).mockResolvedValue({
                enabled: false,
            } as never);
        const request =
            kind === 'missing-login'
                ? createHarness(undefined, f.service, undefined, h.store)
                : h;
        const before = await f.snapshot();
        let target: string | string[] | { nested: string } = f.selected;
        if (kind === 'empty') target = '';
        if (kind === 'array') target = [f.selected, f.other];
        if (kind === 'object') target = { nested: f.selected };
        if (kind === 'foreign') target = randomUUID();
        const response = await request.invoke('/login/bigquery', {
            isPopup: 'true',
            reconnect: kind === 'not-reconnect' ? 'false' : 'true',
            personalCredentialUuid: target,
        });
        expect(new URL(response.location!).pathname).toBe(
            '/auth/popup/failure',
        );
        expect(request.exchange).not.toHaveBeenCalled();
        expect((await f.snapshot()) === before).toBe(true);
    },
);

test.each([
    'wrong-intent',
    'missing-intent',
    'null',
    'undefined',
    'malformed',
    'wrong-user',
    'removed',
    'foreign',
    'provider',
    'disabled',
    'subject',
    'missing-token',
    'missing-scope',
])(
    'the current registered callback rejects %s before grant or credential changes',
    async (kind) => {
        const f = await fixture();
        const h = currentHarness(f);
        await h.invoke('/login/bigquery', {
            isPopup: 'true',
            reconnect: 'true',
            personalCredentialUuid: f.selected,
        });
        const data = (await h.readSession())!;
        if (kind === 'wrong-intent') data.oauth.intent = 'unexpected' as never;
        if (kind === 'missing-intent') delete data.oauth.intent;
        if (kind === 'null') data.oauth.googlePersonalReconnect = null as never;
        if (kind === 'undefined')
            data.oauth.googlePersonalReconnect = undefined;
        if (kind === 'malformed')
            data.oauth.googlePersonalReconnect = {} as never;
        if (kind === 'wrong-user')
            data.oauth.googlePersonalReconnect!.userUuid = randomUUID();
        if (kind === 'foreign')
            await f
                .database('user_warehouse_credentials')
                .where({ user_warehouse_credentials_uuid: f.selected })
                .update({
                    user_uuid: (
                        await f
                            .database('users')
                            .insert({
                                first_name: 'user_b',
                                last_name: 'user_b',
                                is_active: true,
                                is_setup_complete: true,
                                is_marketing_opted_in: false,
                                is_tracking_anonymized: true,
                            })
                            .returning('user_uuid')
                    )[0].user_uuid,
                } as never);
        if (kind === 'removed')
            await f
                .database('user_warehouse_credentials')
                .where({ user_warehouse_credentials_uuid: f.selected })
                .delete();
        if (kind === 'provider')
            await f
                .database('user_warehouse_credentials')
                .where({ user_warehouse_credentials_uuid: f.selected })
                .update({
                    encrypted_credentials: new EncryptionUtil({
                        lightdashConfig,
                    }).encrypt(
                        JSON.stringify({
                            type: WarehouseTypes.BIGQUERY,
                            authenticationType:
                                BigqueryAuthenticationType.PRIVATE_KEY,
                            keyfileContents: { type: 'service_account' },
                        }),
                    ),
                });
        if (kind === 'disabled')
            vi.mocked(f.featureFlagModel.get).mockResolvedValue({
                enabled: false,
            } as never);
        if (kind === 'subject')
            h.profile.mockImplementation((_token, done) =>
                done(null, {
                    id: 'subject_other',
                    emails: [{ value: 'email_other', verified: true }],
                } as never),
            );
        if (kind === 'missing-scope')
            h.exchange.mockImplementation((_code, _params, done) =>
                done(null, 'access_a', 'refresh_a', { scope: 'openid email' }),
            );
        if (kind === 'missing-token')
            h.exchange.mockImplementation((_code, _params, done) =>
                done(null, 'access_a', '', {
                    scope: 'openid email https://www.googleapis.com/auth/bigquery',
                }),
            );
        await h.writeSession(data);
        const before = await f.snapshot();
        const response =
            kind === 'undefined'
                ? await h.invoke(h.callbackPath, { code: 'code_a' }, data)
                : await h.callback();
        expect(new URL(response.location!).pathname).toBe(
            '/auth/popup/failure',
        );
        expect((await f.snapshot()) === before).toBe(true);
        expect(h.authenticate.mock.calls.length).toBeLessThanOrEqual(2);
        if (kind === 'missing-token')
            expect(
                await f.grants.getRefreshToken(
                    f.user.userUuid,
                    OpenIdIdentityIssuerType.GOOGLE,
                ),
            ).toBe('token_saved');
    },
);

test('old metadata-free initiation completes on the new callback through the main storage path', async () => {
    const f = await fixture();
    const old = createHarness(
        f.user,
        f.service,
        createPatchedPrerequisiteGoogleBackend(),
    );
    await old.invoke('/login/bigquery', { isPopup: 'true' });
    const h = currentHarness(f, old.store);
    const response = await h.callback();
    expect(new URL(response.location!).pathname).toBe('/auth/popup/success');
    const rows = await f
        .database('user_warehouse_credentials')
        .where({ user_uuid: f.user.userUuid });
    expect(rows.length).toBe(1);
    expect(
        [f.selected, f.other].includes(rows[0].user_warehouse_credentials_uuid),
    ).toBe(false);
});

class ConnectionStatusService extends ProjectService {
    resolveForTest(
        projectUuid: string,
        userId: string,
        binding: ConnectionBinding,
    ) {
        return this.getWarehouseCredentials({
            projectUuid,
            userId,
            binding,
            isRegisteredUser: true,
        });
    }
}
const connectionStatusFixture = async (strict = false, required = false) => {
    const f = await fixture();
    const project = (await f.credentials.getByUuid(f.selected)).project!;
    const { projectUuid } = project;
    await f
        .database('projects')
        .where({ project_uuid: projectUuid })
        .update({ connection_mode: 'multi' } as never);
    const { project_id: projectId } = (await f
        .database('projects')
        .where({ project_uuid: projectUuid })
        .first())!;
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const base = (token: string): CreateBigqueryCredentials => ({
        type: WarehouseTypes.BIGQUERY,
        authenticationType: BigqueryAuthenticationType.SSO,
        project: 'project_a',
        dataset: 'dataset_a',
        location: undefined,
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        maximumBytesBilled: undefined,
        requireUserCredentials: required,
        allowUserCredentials: true,
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'client_a',
            refresh_token: token,
        },
    });
    await f.database('warehouse_credentials').insert({
        project_id: projectId,
        warehouse_type: WarehouseTypes.BIGQUERY,
        encrypted_credentials: encryptionUtil.encrypt(
            JSON.stringify(base('project_token')),
        ),
    });
    const [original] = await f
        .database('warehouse_connections')
        .insert({
            project_uuid: projectUuid,
            is_original: true,
            name: 'original_a',
        })
        .returning('*');
    const [extra] = await f
        .database('warehouse_connections')
        .insert({
            project_uuid: projectUuid,
            is_original: false,
            name: 'extra_a',
            warehouse_type: WarehouseTypes.BIGQUERY,
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify(base('extra_project_token')),
            ),
        })
        .returning('*');
    await f
        .database('user_warehouse_credentials')
        .where({ user_warehouse_credentials_uuid: f.other })
        .update({ project_uuid: projectUuid } as never);
    const organizationWarehouseCredentialsModel =
        new OrganizationWarehouseCredentialsModel({
            database: f.database,
            encryptionUtil,
        });
    const warehouseConnectionModel = new WarehouseConnectionModel({
        database: f.database,
        encryptionUtil,
        organizationWarehouseCredentialsModel,
    });
    await warehouseConnectionModel.upsertUserCredentialsPreference({
        userUuid: f.user.userUuid,
        warehouseConnectionUuid: extra.warehouse_connection_uuid,
        userWarehouseCredentialsUuid: f.other,
    });
    const projectModel = new ProjectModel({
        database: f.database,
        encryptionUtil,
        lightdashConfig,
    });
    vi.spyOn(f.featureFlagModel, 'get').mockImplementation(
        async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity ? strict : true,
        }),
    );
    const service = new ConnectionStatusService({
        lightdashConfig,
        projectModel,
        warehouseConnectionModel,
        organizationWarehouseCredentialsModel,
        userWarehouseCredentialsModel: f.credentials,
        featureFlagModel: f.featureFlagModel,
    } as never);
    const ability = new Ability([{ action: 'view', subject: 'Project' }]);
    const account = fromSession({
        ...f.user,
        organizationCreatedAt: new Date(),
        organizationName: 'organization_a',
        ability,
        abilityRules: ability.rules,
    } as SessionUser);
    const status = (binding?: string, viewer: Account = account) =>
        service.getSharedSignInStatus(viewer, projectUuid, true, binding);
    return {
        ...f,
        projectUuid,
        projectId,
        userService: f.service,
        originalUuid: original.warehouse_connection_uuid,
        extraUuid: extra.warehouse_connection_uuid,
        projectModel,
        warehouseConnectionModel,
        service,
        account,
        status,
        encryptionUtil,
        base,
    };
};

test.each(
    [false, true].flatMap((strict) =>
        [false, true].map((extraExpired) => ({ strict, extraExpired })),
    ),
)(
    'persisted original/extra preferences select distinct rows for status and execution: %j',
    async ({ strict, extraExpired }) => {
        const f = await connectionStatusFixture(strict);
        const access = vi
            .spyOn(GoogleAuth.prototype, 'getAccessToken')
            .mockImplementation(async function getToken(this: GoogleAuth) {
                const token = (
                    this.jsonContent as { refresh_token?: string } | null
                )?.refresh_token;
                if (token === (extraExpired ? 'token_b' : 'token_a'))
                    throw {
                        response: {
                            status: 400,
                            data: { error: 'invalid_grant' },
                        },
                    };
                return 'access_a';
            });
        const preferences = JSON.stringify(
            await f
                .database('warehouse_connection_user_credentials_preference')
                .orderBy('warehouse_connection_uuid'),
        );
        const original = await f.status();
        const extra = await f.status(f.extraUuid);
        expect(
            original?.personalSignIn?.userWarehouseCredentialsUuid ===
                f.selected,
        ).toBe(true);
        expect(
            extra?.personalSignIn?.userWarehouseCredentialsUuid === f.other,
        ).toBe(true);
        expect(original?.personalSignIn?.expired).toBe(!extraExpired);
        expect(extra?.personalSignIn?.expired).toBe(extraExpired);
        expect(extra?.personalSelection?.warehouseConnectionUuid).toBe(
            f.extraUuid,
        );
        expect(access).toHaveBeenCalledTimes(2);
        const probedTokens = access.mock.contexts.map(
            (auth) =>
                (
                    (auth as GoogleAuth).jsonContent as {
                        refresh_token?: string;
                    } | null
                )?.refresh_token,
        );
        expect(
            probedTokens.every(
                (token) =>
                    token !== 'project_token' &&
                    token !== 'extra_project_token',
            ),
        ).toBe(true);
        const originalQuery = await f.service.resolveForTest(
            f.projectUuid,
            f.user.userUuid,
            { kind: 'original' },
        );
        const extraQuery = await f.service.resolveForTest(
            f.projectUuid,
            f.user.userUuid,
            { kind: 'connection', warehouseConnectionUuid: f.extraUuid },
        );
        expect(originalQuery.userWarehouseCredentialsUuid === f.selected).toBe(
            true,
        );
        expect(extraQuery.userWarehouseCredentialsUuid === f.other).toBe(true);
        expect(
            JSON.stringify(
                await f
                    .database(
                        'warehouse_connection_user_credentials_preference',
                    )
                    .orderBy('warehouse_connection_uuid'),
            ) === preferences,
        ).toBe(true);
    },
);

test.each([false, true])(
    'extra absence uses sole-unclaimed selection only when required=%s and status never claims it',
    async (required) => {
        const f = await connectionStatusFixture(false, required);
        await f
            .database('warehouse_connection_user_credentials_preference')
            .where({ warehouse_connection_uuid: f.extraUuid })
            .delete();
        await f
            .database('project_user_warehouse_credentials_preference')
            .where({ user_warehouse_credentials_uuid: f.other })
            .delete();
        vi.spyOn(GoogleAuth.prototype, 'getAccessToken').mockResolvedValue(
            'access_a',
        );
        const result = await f.status(f.extraUuid);
        expect(
            result?.personalSignIn?.userWarehouseCredentialsUuid ?? null,
        ).toBe(required ? f.other : null);
        expect(
            await f
                .database('warehouse_connection_user_credentials_preference')
                .where({ warehouse_connection_uuid: f.extraUuid }),
        ).toHaveLength(0);
        const query = await f.service.resolveForTest(
            f.projectUuid,
            f.user.userUuid,
            { kind: 'connection', warehouseConnectionUuid: f.extraUuid },
        );
        expect(query.userWarehouseCredentialsUuid ?? null).toBe(
            required ? f.other : null,
        );
        expect(
            await f
                .database('warehouse_connection_user_credentials_preference')
                .where({ warehouse_connection_uuid: f.extraUuid }),
        ).toHaveLength(required ? 1 : 0);
    },
);

test.each(['foreign', 'missing', 'malformed', 'no-opt-in', 'inaccessible'])(
    'bound status rejects %s before secrets, probing, or marks',
    async (kind) => {
        const f = await connectionStatusFixture();
        const access = vi
            .spyOn(GoogleAuth.prototype, 'getAccessToken')
            .mockResolvedValue('access_a');
        const secrets = vi.spyOn(f.credentials, 'getByUuidWithSecrets');
        const mark = vi.spyOn(f.credentials, 'markNeedsSignIn');
        const base = vi.spyOn(
            f.projectModel,
            'getWarehouseCredentialsForProject',
        );
        let binding = kind === 'malformed' ? '' : randomUUID();
        if (kind === 'foreign') {
            const otherProject = (await f
                .database('projects')
                .whereNot({ project_uuid: f.projectUuid })
                .first())!;
            binding = (
                await f
                    .database('warehouse_connections')
                    .insert({
                        project_uuid: otherProject.project_uuid,
                        is_original: false,
                        name: 'foreign_a',
                        warehouse_type: WarehouseTypes.BIGQUERY,
                        encrypted_credentials: f.encryptionUtil.encrypt(
                            JSON.stringify(f.base('other_token')),
                        ),
                    })
                    .returning('warehouse_connection_uuid')
            )[0].warehouse_connection_uuid;
        }
        const ability = new Ability([]);
        const denied = fromSession({
            ...f.user,
            ability,
            abilityRules: ability.rules,
        } as SessionUser);
        await expect(
            kind === 'no-opt-in'
                ? f.service.getSharedSignInStatus(
                      f.account,
                      f.projectUuid,
                      false,
                      binding,
                  )
                : f.status(
                      binding,
                      kind === 'inaccessible' ? denied : f.account,
                  ),
        ).rejects.toThrow();
        expect(secrets).not.toHaveBeenCalled();
        expect(access).not.toHaveBeenCalled();
        expect(mark).not.toHaveBeenCalled();
        expect(base).not.toHaveBeenCalled();
    },
);

test.each([WarehouseTypes.SNOWFLAKE, WarehouseTypes.DATABRICKS])(
    'an old or flag-off %s reconnect cannot resurrect a stored expiry mark on load',
    async (type) => {
        const f = await connectionStatusFixture();
        const personal =
            type === WarehouseTypes.SNOWFLAKE
                ? {
                      type,
                      authenticationType: SnowflakeAuthenticationType.SSO,
                      user: 'user_a',
                      refreshToken: 'token_fresh',
                  }
                : {
                      type,
                      authenticationType:
                          DatabricksAuthenticationType.OAUTH_U2M,
                      serverHostName: 'warehouse.example',
                      httpPath: '/sql/path',
                      refreshToken: 'token_fresh',
                  };
        const credentials = {
            ...personal,
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        await f
            .database('warehouse_credentials')
            .where({ project_id: f.projectId })
            .update({
                warehouse_type: type,
                encrypted_credentials: f.encryptionUtil.encrypt(
                    JSON.stringify(credentials),
                ),
            });
        await f
            .database('user_warehouse_credentials')
            .where({ user_warehouse_credentials_uuid: f.selected })
            .update({
                warehouse_type: type,
                encrypted_credentials: f.encryptionUtil.encrypt(
                    JSON.stringify(personal),
                ),
                needs_sign_in_at: new Date(),
                needs_sign_in_reason: WarehouseSignInRejection.INVALID_GRANT,
            });
        vi.mocked(f.featureFlagModel.get).mockResolvedValue({
            enabled: false,
        } as never);
        const userService = new UserService({
            lightdashConfig,
            userWarehouseCredentialsModel: f.credentials,
            featureFlagModel: f.featureFlagModel,
            analytics: { track: () => {} },
        } as never);
        await userService.updateWarehouseCredentials(f.user, f.selected, {
            name: 'credential_a',
            credentials: personal,
        } as never);
        vi.mocked(f.featureFlagModel.get).mockImplementation(
            async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled: featureFlagId !== FeatureFlags.AgentIdentity,
            }),
        );
        const mark = await f
            .database('user_warehouse_credentials')
            .where({ user_warehouse_credentials_uuid: f.selected })
            .first();
        expect(mark!.needs_sign_in_at).not.toBeNull();
        const access = vi.spyOn(GoogleAuth.prototype, 'getAccessToken');
        expect(await f.status()).toBeNull();
        expect(access).not.toHaveBeenCalled();
    },
);

test.each([false, true])(
    'an unknown Google status keeps only a previously persisted expiry: known=%s',
    async (known) => {
        const f = await connectionStatusFixture();
        if (known) {
            const snapshot = await f.credentials.getSignInSnapshot(
                f.selected,
                f.base('token_a'),
            );
            await f.credentials.markNeedsSignIn(
                snapshot!,
                WarehouseSignInRejection.INVALID_GRANT,
            );
        }
        const before = await f.snapshot();
        vi.spyOn(GoogleAuth.prototype, 'getAccessToken').mockRejectedValue({
            response: { status: 503, data: { error: 'invalid_grant' } },
        });
        const mark = vi.spyOn(f.credentials, 'markNeedsSignIn');
        const status = await f.status();
        expect(status?.personalSignIn?.expired).toBe(known);
        expect(status?.statusUnknown).toBe(true);
        expect(mark).not.toHaveBeenCalled();
        expect((await f.snapshot()) === before).toBe(true);
    },
);

test.each(['wrong-state', 'missing-state'])(
    'the current selected callback preserves state and PKCE validation for %s',
    async (kind) => {
        const f = await fixture();
        const h = currentHarness(f);
        await h.invoke('/login/bigquery', {
            isPopup: 'true',
            reconnect: 'true',
            personalCredentialUuid: f.selected,
        });
        const before = await f.snapshot();
        const result = await h.invoke(h.callbackPath, {
            code: 'code_a',
            ...(kind === 'wrong-state' ? { state: 'wrong_state' } : {}),
        });
        expect(new URL(result.location!).pathname).toBe('/auth/popup/failure');
        expect(h.exchange).not.toHaveBeenCalled();
        expect((await f.snapshot()) === before).toBe(true);
    },
);

test('a metadata-free explicit reconnect without a refresh token preserves the usable grant and never authorizes a second time', async () => {
    const f = await fixture();
    const h = currentHarness(f);
    const started = await h.invoke('/login/bigquery', {
        isPopup: 'true',
        reconnect: 'true',
    });
    expect(new URL(started.location!).searchParams.has('prompt')).toBe(false);
    h.exchange.mockImplementation((_code, _params, done) =>
        done(null, 'access_a', '', {
            scope: 'openid email https://www.googleapis.com/auth/bigquery',
        }),
    );
    const before = await f.snapshot();
    const result = await h.callback();
    expect(new URL(result.location!).pathname).toBe('/auth/popup/failure');
    expect((await f.snapshot()) === before).toBe(true);
    expect(h.authenticate).toHaveBeenCalledTimes(2);
    expect(h.exchange).toHaveBeenCalledOnce();
});

test.each(['removed', 'foreign', 'provider', 'disabled'])(
    'callback revalidates a target changed during the OAuth exchange: %s',
    async (kind) => {
        const f = await fixture();
        const h = currentHarness(f);
        await h.invoke('/login/bigquery', {
            isPopup: 'true',
            reconnect: 'true',
            personalCredentialUuid: f.selected,
        });
        let before = '';
        h.exchange.mockImplementation(async (_code, _params, done) => {
            const row = f
                .database('user_warehouse_credentials')
                .where({ user_warehouse_credentials_uuid: f.selected });
            if (kind === 'removed') await row.delete();
            if (kind === 'foreign') {
                const [other] = await f
                    .database('users')
                    .insert({
                        first_name: 'user_b',
                        last_name: 'user_b',
                        is_active: true,
                        is_setup_complete: true,
                        is_marketing_opted_in: false,
                        is_tracking_anonymized: true,
                    })
                    .returning('user_uuid');
                await row.update({ user_uuid: other.user_uuid } as never);
            }
            if (kind === 'provider')
                await row.update({
                    encrypted_credentials: new EncryptionUtil({
                        lightdashConfig,
                    }).encrypt(
                        JSON.stringify({
                            type: WarehouseTypes.BIGQUERY,
                            authenticationType:
                                BigqueryAuthenticationType.PRIVATE_KEY,
                            keyfileContents: { type: 'service_account' },
                        }),
                    ),
                });
            if (kind === 'disabled')
                vi.mocked(f.featureFlagModel.get).mockResolvedValue({
                    enabled: false,
                } as never);
            before = await f.snapshot();
            done(null, 'access_a', 'refresh_a', {
                scope: 'openid email https://www.googleapis.com/auth/bigquery',
            });
        });
        const response = await h.callback();
        expect(new URL(response.location!).pathname).toBe(
            '/auth/popup/failure',
        );
        expect(h.exchange).toHaveBeenCalledOnce();
        expect(before).not.toBe('');
        expect((await f.snapshot()) === before).toBe(true);
    },
);

test.each(['original-uuid', 'single-route'])(
    'status uses the canonical original target for %s',
    async (kind) => {
        const f = await connectionStatusFixture();
        if (kind === 'single-route')
            await f
                .database('projects')
                .where({ project_uuid: f.projectUuid })
                .update({ connection_mode: 'single' } as never);
        vi.spyOn(GoogleAuth.prototype, 'getAccessToken').mockResolvedValue(
            'access_a',
        );
        const warehouseConnectionUuid =
            kind === 'single-route' ? randomUUID() : f.originalUuid;
        const status = await f.status(warehouseConnectionUuid);
        expect(status?.personalSelection?.warehouseConnectionUuid).toBeNull();
        expect(
            status?.personalSignIn?.userWarehouseCredentialsUuid === f.selected,
        ).toBe(true);
        const resolved = await f.service.resolveForTest(
            f.projectUuid,
            f.user.userUuid,
            { kind: 'connection', warehouseConnectionUuid },
        );
        expect(resolved.userWarehouseCredentialsUuid === f.selected).toBe(true);
    },
);

const reconnectSelectedForStatus = async (
    f: Awaited<ReturnType<typeof connectionStatusFixture>>,
    token: string,
) => {
    const h = currentHarness({ ...f, service: f.userService });
    const exchange = h.exchange.getMockImplementation()!;
    h.exchange.mockImplementation((code, params, done) =>
        exchange(code, params, (error, access, _refresh, extra) =>
            done(error, access, token, extra),
        ),
    );
    await h.invoke('/login/bigquery', {
        isPopup: 'true',
        reconnect: 'true',
        personalCredentialUuid: f.selected,
    });
    expect(new URL((await h.callback()).location!).pathname).toBe(
        '/auth/popup/success',
    );
};

test.each(['token_a', 'token_new'])(
    'an in-flight selected probe discards the old incarnation after persisted reconnect with %s',
    async (token) => {
        const f = await connectionStatusFixture();
        const pending = Promise.withResolvers<never>();
        const started = Promise.withResolvers<void>();
        const access = vi
            .spyOn(GoogleAuth.prototype, 'getAccessToken')
            .mockImplementationOnce(() => {
                started.resolve();
                return pending.promise;
            })
            .mockResolvedValue('access_new');
        const before = await f.credentials.getSignInSnapshot(
            f.selected,
            await f.service.resolveForTest(f.projectUuid, f.user.userUuid, {
                kind: 'original',
            }),
        );
        const checking = f.status();
        await started.promise;
        await reconnectSelectedForStatus(f, token);
        pending.reject({
            response: { status: 400, data: { error: 'invalid_grant' } },
        });
        const status = await checking;
        expect(status?.personalSignIn?.expired).toBe(false);
        expect(access).toHaveBeenCalledTimes(2);
        expect(
            (await f.credentials.getByUuid(f.selected, true)).needsSignIn,
        ).toBeNull();
        const current = await f.credentials.getSignInSnapshot(
            f.selected,
            await f.service.resolveForTest(f.projectUuid, f.user.userUuid, {
                kind: 'original',
            }),
        );
        expect(
            current!.encryptedCredentials.equals(before!.encryptedCredentials),
        ).toBe(false);
    },
);

test('a current persisted query rejection bypasses a cached healthy preflight without accepting an obsolete rejection', async () => {
    const f = await connectionStatusFixture();
    const access = vi
        .spyOn(GoogleAuth.prototype, 'getAccessToken')
        .mockResolvedValue('access_a');
    expect((await f.status())?.personalSignIn?.expired).toBe(false);
    const selected = await f.service.resolveForTest(
        f.projectUuid,
        f.user.userUuid,
        { kind: 'original' },
    );
    const snapshot = (await f.credentials.getSignInSnapshot(
        f.selected,
        selected,
    ))!;
    const factory = new WarehouseClientFactory({
        lightdashConfig,
        featureFlagModel: f.featureFlagModel,
        userWarehouseCredentialsModel: f.credentials,
        logger: { warn: vi.fn() },
    } as never);
    const rejection = new BigqueryTokenError('query_failure_a', {
        rejection: WarehouseSignInRejection.INVALID_GRANT,
    });
    await expect(
        factory.attributeSharedSignInExpiry(
            f.projectUuid,
            selected,
            rejection,
            { snapshot, organizationUuid: null },
        ),
    ).rejects.toMatchObject({
        data: { personalSignIn: { userWarehouseCredentialsUuid: f.selected } },
    });
    access.mockRejectedValue({
        response: { status: 400, data: { error: 'invalid_grant' } },
    });
    expect((await f.status())?.personalSignIn?.expired).toBe(true);
    expect(access).toHaveBeenCalledTimes(2);
    await reconnectSelectedForStatus(f, 'token_a');
    await expect(
        factory.attributeSharedSignInExpiry(
            f.projectUuid,
            selected,
            rejection,
            { snapshot, organizationUuid: null },
        ),
    ).rejects.toBe(rejection);
    access.mockResolvedValue('access_new');
    expect((await f.status())?.personalSignIn?.expired).toBe(false);
    expect(access).toHaveBeenCalledTimes(3);
    expect(
        (await f.credentials.getByUuid(f.selected, true)).needsSignIn,
    ).toBeNull();
});
