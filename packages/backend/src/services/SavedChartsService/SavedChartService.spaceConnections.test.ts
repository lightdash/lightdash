import { Ability } from '@casl/ability';
import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    ForbiddenError,
    SpaceMemberRole,
    type MetricQuery,
    type PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { SavedChartService } from './SavedChartService';

const query: MetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
    customDimensions: [
        {
            id: 'custom',
            name: 'Custom',
            table: 'orders',
            type: CustomDimensionType.SQL,
            dimensionType: DimensionType.STRING,
            sql: 'SELECT secret FROM private_table',
        },
    ],
};
const chart = {
    uuid: 'chart',
    organizationUuid: 'org',
    projectUuid: 'project',
    spaceUuid: 'child',
    name: 'Chart',
    slug: 'chart',
    dashboardUuid: null,
    tableName: 'orders',
    metricQuery: query,
    chartConfig: { type: ChartType.TABLE, config: {} },
    tableConfig: { columnOrder: [] },
};
const saved = new Error('Reached chart persistence');

const setup = ({
    enabled = true,
    boundEditor = false,
    sqlRunner = true,
} = {}) => {
    const user = {
        ...defaultSessionUser,
        organizationUuid: 'org',
        userUuid: 'editor',
        ability: new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'SavedChart' },
            { action: 'manage', subject: 'CustomFields' },
            { action: 'manage', subject: 'CustomSqlTableCalculations' },
            ...(sqlRunner
                ? [{ action: 'manage' as const, subject: 'SqlRunner' as const }]
                : []),
        ]),
    };
    const savedChartModel = {
        get: vi.fn().mockResolvedValue(chart),
        getSummary: vi.fn().mockResolvedValue(chart),
        create: vi.fn().mockRejectedValue(saved),
        update: vi.fn().mockRejectedValue(saved),
        updateMultiple: vi.fn().mockRejectedValue(saved),
        createVersion: vi.fn().mockRejectedValue(saved),
        moveToSpace: vi.fn().mockRejectedValue(saved),
    };
    const spaceModel = {
        getConnectionBoundSpaces: vi
            .fn()
            .mockResolvedValue([
                { spaceUuid: 'bound', warehouseConnectionUuid: 'reserved' },
            ]),
        getEffectiveWarehouseConnectionUuid: vi
            .fn()
            .mockResolvedValue('reserved'),
    };
    const service = new SavedChartService({
        analytics: analyticsMock,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
        },
        savedChartModel,
        spaceModel,
        contentVerificationModel: {
            getByContent: vi.fn().mockResolvedValue(undefined),
        },
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                inheritsFromOrgOrProject: false,
                access: [],
            }),
            resolveAccessBatch: vi.fn().mockResolvedValue([
                {
                    target: { spaceUuid: 'bound' },
                    context: {
                        organizationUuid: 'org',
                        projectUuid: 'project',
                        inheritsFromOrgOrProject: false,
                        access: boundEditor
                            ? [
                                  {
                                      userUuid: 'editor',
                                      role: SpaceMemberRole.EDITOR,
                                  },
                              ]
                            : [],
                    },
                },
            ]),
        },
    } as never);
    vi.spyOn(
        service as unknown as Record<
            string,
            (...args: unknown[]) => Promise<unknown>
        >,
        'assertCanMutateVerifiedChart',
    ).mockResolvedValue(undefined);
    vi.spyOn(
        service as unknown as Record<
            string,
            (...args: unknown[]) => Promise<unknown>
        >,
        'validateMetricReferences',
    ).mockResolvedValue(undefined);
    vi.spyOn(
        service as unknown as Record<
            string,
            (...args: unknown[]) => Promise<unknown>
        >,
        'getVerificationAfterChartUpdate',
    ).mockResolvedValue(null);
    vi.spyOn(
        service as unknown as Record<
            string,
            (...args: unknown[]) => Promise<unknown>
        >,
        'maybeStoreDraft',
    ).mockResolvedValue(undefined);
    vi.spyOn(
        service as unknown as Record<
            string,
            (...args: unknown[]) => Promise<unknown>
        >,
        'resolveDraftBase',
    ).mockResolvedValue(null);
    return { user, service, savedChartModel, spaceModel };
};

describe('Saved chart SQL connection reservations', () => {
    const write = (operation: string, fixture: ReturnType<typeof setup>) => {
        const { service, user } = fixture;
        if (operation === 'create')
            return service.create(
                fromSession(user, 'session'),
                'project',
                chart as never,
            );
        if (operation === 'version')
            return service.createVersion(
                fromSession(user, 'session'),
                'chart',
                chart as never,
            );
        if (operation === 'bulk')
            return service.updateMultiple(user, 'project', [
                { uuid: 'chart', name: 'Chart', spaceUuid: 'child' } as never,
            ]);
        if (operation === 'update')
            return service.update(user, 'chart', {
                spaceUuid: 'child',
            } as never);
        return service.moveToSpace(
            user,
            {
                projectUuid: 'project',
                itemUuid: 'chart',
                targetSpaceUuid: 'child',
            },
            { checkForAccess: false },
        );
    };

    it.each(['create', 'version', 'update', 'move', 'bulk'])(
        'refuses %s by an editor of only an inheriting child',
        async (operation) => {
            const fixture = setup();
            await expect(write(operation, fixture)).rejects.toBeInstanceOf(
                ForbiddenError,
            );
            expect(fixture.savedChartModel.create).not.toHaveBeenCalled();
            expect(
                fixture.savedChartModel.createVersion,
            ).not.toHaveBeenCalled();
            expect(fixture.savedChartModel.update).not.toHaveBeenCalled();
            expect(fixture.savedChartModel.moveToSpace).not.toHaveBeenCalled();
        },
    );

    it.each(['create', 'version', 'update', 'move', 'bulk'])(
        'allows %s by a bound-space editor with SqlRunner',
        async (operation) => {
            await expect(
                write(operation, setup({ boundEditor: true })),
            ).rejects.toBe(saved);
        },
    );

    it('requires SqlRunner even for a bound-space editor', async () => {
        await expect(
            write('create', setup({ boundEditor: true, sqlRunner: false })),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it.each(['create', 'version', 'update', 'move', 'bulk'])(
        'leaves %s unchanged with the flag off',
        async (operation) => {
            const fixture = setup({ enabled: false });
            await expect(write(operation, fixture)).rejects.toBe(saved);
            expect(
                fixture.spaceModel.getConnectionBoundSpaces,
            ).not.toHaveBeenCalled();
            expect(
                fixture.spaceModel.getEffectiveWarehouseConnectionUuid,
            ).not.toHaveBeenCalled();
            if (operation === 'move' || operation === 'update')
                expect(fixture.savedChartModel.get).not.toHaveBeenCalled();
        },
    );

    it('leaves charts without custom SQL unaffected', async () => {
        const fixture = setup();
        await expect(
            fixture.service.create(
                fromSession(fixture.user, 'session'),
                'project',
                {
                    ...chart,
                    metricQuery: { ...query, customDimensions: [] },
                } as never,
            ),
        ).rejects.toBe(saved);
        expect(
            fixture.spaceModel.getConnectionBoundSpaces,
        ).not.toHaveBeenCalled();
    });

    it.each([
        {
            ...query,
            customDimensions: [],
            tableCalculations: [
                {
                    name: 'secret',
                    displayName: 'Secret',
                    sql: 'SELECT secret FROM private_table',
                },
            ],
        },
        {
            ...query,
            customDimensions: [],
            additionalMetrics: [
                {
                    name: 'secret',
                    table: 'orders',
                    type: 'sum',
                    sql: 'SELECT secret FROM private_table',
                },
            ],
        },
    ])('checks the other forms of user-authored SQL', async (metricQuery) => {
        const fixture = setup();
        await expect(
            fixture.service.create(
                fromSession(fixture.user, 'session'),
                'project',
                {
                    ...chart,
                    metricQuery,
                } as never,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });
});
