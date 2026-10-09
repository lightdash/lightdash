import {
    DatabricksAuthenticationType,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { RefreshTokenSourceChangedError } from '../../models/RefreshTokenRotation/RefreshTokenRotation';
import { connectionContextFromUser } from '../WarehouseClientFactory/ConnectionContext';
import { type WarehouseCredentialResolutionContext } from '../WarehouseClientFactory/WarehouseCredentialSource';
import {
    OAuthCredentialRefreshSource,
    type OAuthCredentialOwner,
    type OAuthRefreshSourceCredentials,
} from './OAuthCredentialRefreshSource';

type DatabricksCredentials = Extract<
    OAuthRefreshSourceCredentials,
    { type: WarehouseTypes.DATABRICKS }
>;
const credentials = {
    type: WarehouseTypes.DATABRICKS as const,
    authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
    serverHostName: 'workspace.databricks.test',
    httpPath: '/sql/warehouse',
    database: 'schema',
    oauthClientId: 'client',
    refreshToken: 'current',
};
const owners: OAuthCredentialOwner[] = [
    { kind: 'project', uuid: 'project-owner' },
    { kind: 'organization', uuid: 'organization-owner' },
    {
        kind: 'user',
        uuid: 'user-owner',
        purpose: UserWarehouseCredentialPurpose.DEFAULT,
    },
    { kind: 'warehouseConnection', uuid: 'connection-owner' },
];
const trx = {} as Knex;
const setup = () => {
    const project = {
        projectUuid: 'project',
        organizationUuid: 'org',
        connectionMode: 'multi' as const,
        originalWarehouseType: WarehouseTypes.DATABRICKS,
    };
    const deps = {
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue(project),
            getOwnWarehouseCredentialsForProject: vi
                .fn()
                .mockResolvedValue(credentials),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        organizationWarehouseCredentialsModel: {
            getByUuidWithSensitiveData: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org', credentials }),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        userWarehouseCredentialsModel: {
            getByUuidWithSecrets: vi.fn().mockResolvedValue({ credentials }),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        warehouseConnectionModel: {
            getProject: vi.fn().mockResolvedValue(project),
            getOwnCredentials: vi.fn().mockResolvedValue(credentials),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        logger: { error: vi.fn() },
    };
    const matchesIdentity = vi.fn(
        (current: DatabricksCredentials, selected: DatabricksCredentials) =>
            current.serverHostName === selected.serverHostName &&
            current.oauthClientId === selected.oauthClientId,
    );
    const source = new OAuthCredentialRefreshSource(deps, {
        isCredential: (current): current is DatabricksCredentials =>
            current.type === WarehouseTypes.DATABRICKS &&
            current.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M,
        matchesIdentity,
    });
    const input = {
        connection: credentials,
        projectUuid: 'project' as string | null,
        context: connectionContextFromUser(
            { userUuid: 'person' },
            { organizationUuid: 'org', queryContext: null },
        ) as WarehouseCredentialResolutionContext,
    };
    return { deps, source, input, project, matchesIdentity };
};

describe.each(owners)('$kind source', (owner) => {
    test('reads the exact owner and uses the held transaction for the guarded write', async () => {
        const f = setup();
        await expect(
            f.source.readCurrentRefreshToken(f.input, owner, trx),
        ).resolves.toBe('current');
        await f.source.persist(f.input, owner, 'current', 'rotated', trx);
        const readArgs =
            owner.kind === 'warehouseConnection'
                ? [f.project, owner.uuid, trx]
                : [owner.uuid, trx];
        const writeArgs = {
            project: [owner.uuid, 'current', 'rotated', trx],
            organization: [owner.uuid, 'current', 'rotated', trx],
            user: [owner.uuid, 'current', 'rotated', undefined, trx],
            warehouseConnection: [
                f.project,
                owner.uuid,
                'current',
                'rotated',
                trx,
            ],
        }[owner.kind];
        const reader = {
            project: f.deps.projectModel.getOwnWarehouseCredentialsForProject,
            organization:
                f.deps.organizationWarehouseCredentialsModel
                    .getByUuidWithSensitiveData,
            user: f.deps.userWarehouseCredentialsModel.getByUuidWithSecrets,
            warehouseConnection:
                f.deps.warehouseConnectionModel.getOwnCredentials,
        }[owner.kind];
        const writer = {
            project: f.deps.projectModel.rotateRefreshToken,
            organization:
                f.deps.organizationWarehouseCredentialsModel.rotateRefreshToken,
            user: f.deps.userWarehouseCredentialsModel.rotateRefreshToken,
            warehouseConnection:
                f.deps.warehouseConnectionModel.rotateRefreshToken,
        }[owner.kind];
        expect(reader).toHaveBeenCalledExactlyOnceWith(...readArgs);
        expect(writer).toHaveBeenCalledExactlyOnceWith(...writeArgs);
        if (owner.kind === 'warehouseConnection')
            expect(
                f.deps.warehouseConnectionModel.getProject,
            ).toHaveBeenCalledWith('project', trx);
    });

    test('keeps legacy writes free of transaction and expiry arguments', async () => {
        const f = setup();
        await f.source.persist(f.input, owner, 'current', 'rotated');
        const writer = {
            project: f.deps.projectModel.rotateRefreshToken,
            organization:
                f.deps.organizationWarehouseCredentialsModel.rotateRefreshToken,
            user: f.deps.userWarehouseCredentialsModel.rotateRefreshToken,
            warehouseConnection:
                f.deps.warehouseConnectionModel.rotateRefreshToken,
        }[owner.kind];
        expect(writer).toHaveBeenCalledExactlyOnceWith(
            ...(owner.kind === 'warehouseConnection'
                ? [f.project, owner.uuid, 'current', 'rotated']
                : [owner.uuid, 'current', 'rotated']),
        );
    });
});

test.each(['serverHostName', 'oauthClientId'] as const)(
    'rejects a changed %s before returning its token',
    async (field) => {
        const f = setup();
        f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
            { ...credentials, [field]: 'replacement' },
        );
        await expect(
            f.source.readCurrentRefreshToken(f.input, owners[0], trx),
        ).rejects.toBeInstanceOf(RefreshTokenSourceChangedError);
    },
);

test('ignores routing and token changes when the provider identity still matches', async () => {
    const f = setup();
    f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue({
        ...credentials,
        httpPath: '/other/warehouse',
        refreshToken: 'rotated',
    });
    await expect(
        f.source.readCurrentRefreshToken(f.input, owners[0], trx),
    ).resolves.toBe('rotated');
});

test('returns no token when the provider predicate rejects changed credentials', async () => {
    const f = setup();
    f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue({
        ...credentials,
        authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
    });
    await expect(
        f.source.readCurrentRefreshToken(f.input, owners[0], trx),
    ).resolves.toBeNull();
    expect(f.matchesIdentity).not.toHaveBeenCalled();
});

test('maps missing owner rows to a retryable source change', async () => {
    const f = setup();
    f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockRejectedValue(
        new NotFoundError('missing'),
    );
    await expect(
        f.source.readCurrentRefreshToken(f.input, owners[0], trx),
    ).rejects.toBeInstanceOf(RefreshTokenSourceChangedError);
});

test.each([null, 'another-org'])(
    'rejects a connection with a missing project or wrong organization: %s',
    async (organizationUuid) => {
        const f = setup();
        if (organizationUuid === null) f.input.projectUuid = null;
        else
            f.deps.warehouseConnectionModel.getProject.mockResolvedValue({
                ...f.project,
                organizationUuid,
            });
        await expect(
            f.source.readCurrentRefreshToken(f.input, owners[3], trx),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(
            f.deps.warehouseConnectionModel.getOwnCredentials,
        ).not.toHaveBeenCalled();
    },
);

test('keeps persistence failures best effort with the existing log fields', async () => {
    const f = setup();
    f.deps.projectModel.rotateRefreshToken.mockRejectedValue(
        new Error('write failed'),
    );
    await expect(
        f.source.persist(f.input, owners[0], 'current', 'rotated', trx),
    ).resolves.toBeUndefined();
    expect(f.deps.logger.error).toHaveBeenCalledExactlyOnceWith(
        'Failed to persist rotated OAuth refresh token',
        {
            sourceKind: 'project',
            sourceUuid: 'project-owner',
            error: 'write failed',
        },
    );
});

test.each(owners)(
    'looks up the organization for $kind when context has none',
    async (owner) => {
        const f = setup();
        f.input.context.organizationUuid = null;
        await expect(f.source.isLockEnabled(f.input, owner)).resolves.toBe(
            true,
        );
        expect(f.deps.featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
            user: { organizationUuid: 'org' },
            featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
        });
        if (owner.kind === 'organization')
            expect(
                f.deps.organizationWarehouseCredentialsModel
                    .getByUuidWithSensitiveData,
            ).toHaveBeenCalledExactlyOnceWith(owner.uuid);
        else
            expect(
                f.deps.projectModel.getSummary,
            ).toHaveBeenCalledExactlyOnceWith(
                owner.kind === 'project' ? owner.uuid : 'project',
            );
    },
);

test('uses the context organization without owner reads and falls back to the global flag without a project', async () => {
    const f = setup();
    await f.source.isLockEnabled(f.input, owners[0]);
    expect(f.deps.projectModel.getSummary).not.toHaveBeenCalled();
    expect(f.deps.featureFlagModel.get).toHaveBeenLastCalledWith({
        user: { organizationUuid: 'org' },
        featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
    });
    f.input.context.organizationUuid = null;
    f.input.projectUuid = null;
    await f.source.isLockEnabled(f.input, owners[2]);
    expect(f.deps.featureFlagModel.get).toHaveBeenLastCalledWith({
        featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
    });
});
