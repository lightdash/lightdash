import {
    BigqueryAuthenticationType,
    BigqueryTokenError,
    DatabricksTokenError,
    FeatureFlags,
    PersonSignInProvider,
    SignInSubjectBasis,
    SnowflakeTokenError,
    UserWarehouseCredentialPurpose,
    WarehouseSignInRejection,
    WarehouseTypes,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import type { PersonalSignInSnapshot } from '../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import {
    capturePersonalSignIn,
    markPersonalSignInRejection,
    type PersonalSignInDependencies,
} from './personalSignIn';
import {
    personaliseSharedSignInError,
    withPersonalSignInExpiry,
    withSharedSignInExpiry,
} from './sharedSignInExpiry';

const credentials: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'project_a',
    dataset: 'dataset_a',
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
    authenticationType: BigqueryAuthenticationType.SSO,
    keyfileContents: {
        type: 'authorized_user',
        refresh_token: 'personal_token_a',
    },
};
const snapshot: PersonalSignInSnapshot = {
    uuid: 'credential_a',
    userUuid: 'user_a',
    encryptedCredentials: Buffer.from('incarnation_a'),
    refreshToken: 'personal_token_a',
};
const setup = () => ({
    featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
    userWarehouseCredentialsModel: {
        getSignInSnapshot: vi.fn().mockResolvedValue(snapshot),
        markNeedsSignIn: vi.fn().mockResolvedValue(true),
    },
    logger: { warn: vi.fn() },
});

test.each([
    null,
    { kind: 'project', uuid: 'project_a' },
    {
        kind: 'user',
        uuid: 'credential_a',
        purpose: UserWarehouseCredentialPurpose.AI,
    },
] as const)('does not capture a nonpersonal owner %j', async (owner) => {
    const deps = setup();
    expect(
        await capturePersonalSignIn(deps, owner, credentials, 'organization_a'),
    ).toBeNull();
    expect(
        deps.userWarehouseCredentialsModel.getSignInSnapshot,
    ).not.toHaveBeenCalled();
});

test('captures only an explicit default credential owner', async () => {
    const deps = setup();
    expect(
        await capturePersonalSignIn(
            deps,
            {
                kind: 'user',
                uuid: 'credential_a',
                purpose: UserWarehouseCredentialPurpose.DEFAULT,
            },
            credentials,
            'organization_a',
        ),
    ).toEqual({ snapshot, organizationUuid: 'organization_a' });
    expect(
        deps.userWarehouseCredentialsModel.getSignInSnapshot,
    ).toHaveBeenCalledWith('credential_a', credentials);
});

test.each(Object.values(WarehouseSignInRejection))(
    'marks a confirmed %s rejection',
    async (rejection) => {
        const deps = setup();
        await markPersonalSignInRejection(
            deps,
            { snapshot, organizationUuid: 'organization_a' },
            new BigqueryTokenError('reconnect', { rejection }),
            snapshot.refreshToken,
        );
        expect(deps.featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.SharedSignInExpiryMessage,
            user: { userUuid: 'user_a', organizationUuid: 'organization_a' },
        });
        expect(
            deps.userWarehouseCredentialsModel.markNeedsSignIn,
        ).toHaveBeenCalledWith(snapshot, rejection);
    },
);

test.each([
    new Error('network'),
    new Error('invalid_grant'),
    new BigqueryTokenError('reconnect'),
])('ignores errors without confirmed provider metadata: %j', async (error) => {
    const deps = setup();
    await markPersonalSignInRejection(
        deps,
        { snapshot, organizationUuid: 'organization_a' },
        error,
        snapshot.refreshToken,
    );
    expect(
        deps.userWarehouseCredentialsModel.markNeedsSignIn,
    ).not.toHaveBeenCalled();
});

test('rechecks the kill switch on each rejection', async () => {
    const deps = setup();
    const error = new BigqueryTokenError('reconnect', {
        rejection: WarehouseSignInRejection.INVALID_GRANT,
    });
    deps.featureFlagModel.get.mockResolvedValueOnce({ enabled: false });
    await markPersonalSignInRejection(
        deps,
        { snapshot, organizationUuid: 'organization_a' },
        error,
        snapshot.refreshToken,
    );
    expect(
        deps.userWarehouseCredentialsModel.markNeedsSignIn,
    ).not.toHaveBeenCalled();
    await markPersonalSignInRejection(
        deps,
        { snapshot, organizationUuid: 'organization_a' },
        error,
        snapshot.refreshToken,
    );
    expect(
        deps.userWarehouseCredentialsModel.markNeedsSignIn,
    ).toHaveBeenCalledOnce();
});

test('ignores a rejection for another token selected under the rotation lock', async () => {
    const deps = setup();
    await markPersonalSignInRejection(
        deps,
        { snapshot, organizationUuid: 'organization_a' },
        new BigqueryTokenError('reconnect', {
            rejection: WarehouseSignInRejection.INVALID_GRANT,
        }),
        'personal_token_b',
    );
    expect(
        deps.userWarehouseCredentialsModel.markNeedsSignIn,
    ).not.toHaveBeenCalled();
});

test('keeps failures in advisory writes out of the query error', async () => {
    const deps = setup();
    deps.userWarehouseCredentialsModel.markNeedsSignIn.mockRejectedValue(
        new Error('private_provider_detail'),
    );
    await expect(
        markPersonalSignInRejection(
            deps as PersonalSignInDependencies,
            { snapshot, organizationUuid: 'organization_a' },
            new BigqueryTokenError('reconnect', {
                rejection: WarehouseSignInRejection.INVALID_GRANT,
            }),
            snapshot.refreshToken,
        ),
    ).resolves.toBe(true);
    expect(deps.logger.warn).toHaveBeenCalledExactlyOnceWith(
        'Could not mark personal warehouse sign-in status',
    );
});

test.each([
    [
        PersonSignInProvider.GOOGLE,
        BigqueryTokenError,
        'Your BigQuery sign-in has expired. Sign in with Google again to load this.',
    ],
    [
        PersonSignInProvider.SNOWFLAKE,
        SnowflakeTokenError,
        'Your Snowflake sign-in has expired. Sign in with Snowflake again to load this.',
    ],
    [
        PersonSignInProvider.DATABRICKS,
        DatabricksTokenError,
        'Your Databricks sign-in has expired. Sign in with Databricks again to load this.',
    ],
] as const)(
    'keeps personal %s attribution separate from shared metadata',
    (provider, ErrorType, message) => {
        const expiry = {
            projectUuid: 'project_a',
            provider,
            userWarehouseCredentialsUuid: 'credential_a',
        };
        const error = withPersonalSignInExpiry(
            new ErrorType('provider_detail_a', {
                rejection: WarehouseSignInRejection.INVALID_GRANT,
            }),
            expiry,
        );
        expect(error).toBeInstanceOf(ErrorType);
        expect(error.statusCode).toBe(401);
        expect(error.message).toBe(message);
        expect(error.data).toEqual({
            personalSignIn: expiry,
            rejection: WarehouseSignInRejection.INVALID_GRANT,
        });
        expect(personaliseSharedSignInError(error, 'user_a')).toBe(error);
    },
);

test.each([BigqueryTokenError, SnowflakeTokenError, DatabricksTokenError])(
    'keeps shared error copy and metadata exact with typed rejection input',
    (ErrorType) => {
        const expiry = {
            projectUuid: 'project_a',
            provider: PersonSignInProvider.GOOGLE,
            subjectUserUuid: 'user_a',
            subjectName: 'user_a',
            subjectBasis: SignInSubjectBasis.RECORDED,
        };
        const original = new ErrorType('provider_detail_a', {
            rejection: WarehouseSignInRejection.INVALID_GRANT,
        });
        const owner = withSharedSignInExpiry(original, expiry, 'user_a');
        expect(owner).toBeInstanceOf(ErrorType);
        expect(owner.message).toBe(
            "Your Google sign-in for this project's connection has expired. Reconnect it in the project's connection settings.",
        );
        expect(owner.data).toEqual({ sharedSignIn: expiry });
        const other = withSharedSignInExpiry(original, expiry, 'user_b');
        expect(other.message).toBe(
            "This project's connection uses user_a's sign-in, which has expired. Ask user_a or an admin to reconnect.",
        );
        expect(other.data).toEqual({ sharedSignIn: expiry });
    },
);

test('does not deliver personal expiry when the captured incarnation is obsolete', async () => {
    const deps = setup();
    deps.userWarehouseCredentialsModel.markNeedsSignIn.mockResolvedValue(false);
    await expect(
        markPersonalSignInRejection(
            deps,
            { snapshot, organizationUuid: 'organization_a' },
            new BigqueryTokenError('reconnect', {
                rejection: WarehouseSignInRejection.INVALID_GRANT,
            }),
            snapshot.refreshToken,
        ),
    ).resolves.toBe(false);
});
