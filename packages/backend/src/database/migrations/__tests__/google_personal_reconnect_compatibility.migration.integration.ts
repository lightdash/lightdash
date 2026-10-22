import {
    BigqueryAuthenticationType,
    DefaultSupportedDbtVersion,
    OpenIdIdentityIssuerType,
    ProjectType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { UserModel } from '../../../models/UserModel';
import { UserOAuthGrantsModel } from '../../../models/UserOAuthGrantsModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { UserService } from '../../../services/UserService';
import {
    createGoogleOAuthCompatibilityHarness,
    googleOAuthCompatibilityConfig as lightdashConfig,
} from '../../../testing/googleOAuthCompatibilityHarness.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

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
    return { database, user: sessionUser, service, selected, other, snapshot };
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
