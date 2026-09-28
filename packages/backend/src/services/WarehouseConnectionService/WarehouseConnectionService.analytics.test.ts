import { Ability } from '@casl/ability';
import {
    ConflictError,
    ProjectType,
    WarehouseTypes,
    type PossibleAbilities,
    type ProjectSummary,
    type WarehouseConnection,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';
import { WarehouseConnectionService } from './WarehouseConnectionService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';
const primaryUuid = 'primary-uuid';
const extraUuid = 'extra-uuid';

const account = fromSession(
    {
        ...defaultSessionUser,
        organizationUuid,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'manage' },
        ]),
    },
    'session-cookie',
);

const project = {
    projectUuid,
    organizationUuid,
    connectionMode: 'multi' as const,
    originalWarehouseType: WarehouseTypes.POSTGRES,
};

const summary = {
    projectUuid,
    organizationUuid,
    name: 'Project',
    provisioningSource: null,
    type: ProjectType.DEFAULT,
} as ProjectSummary;

const connection = (
    warehouseConnectionUuid: string,
    isOriginal: boolean,
): WarehouseConnection => ({
    warehouseConnectionUuid,
    projectUuid,
    name: isOriginal ? 'Primary' : 'Extra',
    isOriginal,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
});

const buildService = () => {
    let primary = connection(primaryUuid, true);
    const extra = connection(extraUuid, false);
    const model = {
        getProject: vi.fn().mockResolvedValue(project),
        get: vi.fn().mockImplementation(async () => primary),
        list: vi.fn().mockImplementation(async () => [primary, extra]),
        lockProject: vi.fn().mockResolvedValue(undefined),
        updateListingSettings: vi
            .fn()
            .mockImplementation(async (_project, _uuid, settings) => {
                primary = { ...primary, ...settings };
            }),
        getBoundContent: vi.fn().mockResolvedValue({
            explores: ['private_explore'],
            dbtSources: [],
            sqlCharts: [],
            inFlightQueries: 0,
        }),
        clearOlderSqlChartVersionBindings: vi.fn(),
        deleteExtra: vi.fn(),
        insertEvent: vi.fn(),
        transaction: vi.fn(),
    };
    model.transaction.mockImplementation(
        async (
            run: (
                transactionModel: WarehouseConnectionModel,
            ) => Promise<unknown>,
        ) => run(model as unknown as WarehouseConnectionModel),
    );
    const analytics = { track: vi.fn<LightdashAnalytics['track']>() };
    const service = new WarehouseConnectionService({
        warehouseConnectionModel: model as unknown as WarehouseConnectionModel,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue(summary),
            getWarehouseCredentialsForProject: vi.fn(),
        } as unknown as Pick<
            ProjectModel,
            'getSummary' | 'getWarehouseCredentialsForProject'
        >,
        userWarehouseCredentialsModel: {
            getByUuid: vi.fn(),
        } as unknown as Pick<UserWarehouseCredentialsModel, 'getByUuid'>,
        featureFlagService: { get: vi.fn() } as unknown as Pick<
            FeatureFlagService,
            'get'
        >,
        licenseService: {
            canHoldMultipleConnections: vi.fn(),
        } as unknown as Pick<LicenseService, 'canHoldMultipleConnections'>,
        credentialPolicy: {
            assertCanWriteWarehouseConnection: vi.fn(),
            testWarehouseConnectionCredentials: vi.fn(),
        },
        analytics,
    });
    return { service, model, analytics };
};

describe('WarehouseConnectionService lifecycle analytics', () => {
    it('tracks the saved SQL runner listing settings for the primary connection', async () => {
        const { service, model, analytics } = buildService();

        await service.update(account, projectUuid, primaryUuid, {
            listAllDatabases: true,
            additionalDatabases: ['private_database'],
        });

        expect(vi.mocked(model.updateListingSettings)).toHaveBeenCalledWith(
            project,
            primaryUuid,
            {
                listAllDatabases: true,
                additionalDatabases: ['private_database'],
            },
        );
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            event: 'warehouse_connection.updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: primaryUuid,
                warehouseType: WarehouseTypes.POSTGRES,
                connectionKind: 'primary',
                credentialSource: 'project',
                connectionCount: 2,
                listAllDatabases: true,
                additionalDatabaseCount: 1,
                changedCredentials: false,
                changedDatabaseSettings: true,
            },
        });
        expect(
            JSON.stringify(vi.mocked(analytics.track).mock.calls),
        ).not.toContain('private_database');
    });

    it('tracks a bound-content removal refusal without deleting the connection', async () => {
        const { service, model, analytics } = buildService();
        vi.mocked(model.get).mockResolvedValue(connection(extraUuid, false));

        await expect(
            service.delete(account, projectUuid, extraUuid),
        ).rejects.toBeInstanceOf(ConflictError);

        expect(vi.mocked(model.deleteExtra)).not.toHaveBeenCalled();
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            event: 'warehouse_connection.action_refused',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: extraUuid,
                warehouseType: WarehouseTypes.POSTGRES,
                connectionKind: 'extra',
                credentialSource: null,
                connectionCount: 2,
                operation: 'remove',
                reason: 'bound_content',
            },
        });
        expect(
            JSON.stringify(vi.mocked(analytics.track).mock.calls),
        ).not.toContain('private_explore');
    });

    it('classifies a refused original-connection removal as primary', async () => {
        const { service, model, analytics } = buildService();

        await expect(
            service.delete(account, projectUuid, primaryUuid),
        ).rejects.toBeInstanceOf(ConflictError);

        expect(vi.mocked(model.deleteExtra)).not.toHaveBeenCalled();
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'warehouse_connection.action_refused',
                properties: expect.objectContaining({
                    warehouseConnectionId: primaryUuid,
                    connectionKind: 'primary',
                    operation: 'remove',
                    reason: 'original_connection',
                }),
            }),
        );
    });
});
