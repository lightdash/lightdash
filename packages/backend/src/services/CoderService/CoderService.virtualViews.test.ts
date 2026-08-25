import { Ability } from '@casl/ability';
import {
    ContentAsCodeType,
    DimensionType,
    ExploreType,
    OrganizationMemberRole,
    PossibleAbilities,
    PromotionAction,
    TimeFrames,
    type Explore,
    type SessionUser,
    type VirtualViewAsCode,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';

const user: SessionUser = {
    userUuid: 'user-uuid',
    email: 'user@example.com',
    firstName: 'Virtual',
    lastName: 'Viewer',
    organizationUuid,
    organizationName: 'Test organization',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ability: new Ability<PossibleAbilities>([
        {
            action: ['view', 'manage'],
            subject: 'ContentAsCode',
            conditions: { projectUuid, organizationUuid },
        },
    ]),
};

const virtualView = {
    name: 'orders_by_customer',
    label: 'Orders by customer',
    type: ExploreType.VIRTUAL,
    baseTable: 'orders_by_customer',
    tables: {
        orders_by_customer: {
            name: 'orders_by_customer',
            sqlTable: '((SELECT ${ld.parameters.region} AS customer_id))',
            dimensions: {
                customer_id: {
                    name: 'customer_id',
                    type: DimensionType.NUMBER,
                },
            },
        },
    },
    savedParameterValues: { region: 'EU' },
} as unknown as Explore;

const asCode: VirtualViewAsCode = {
    contentType: ContentAsCodeType.VIRTUAL_VIEW,
    version: 1,
    slug: 'orders_by_customer',
    name: 'Orders by customer',
    sql: '(SELECT ${ld.parameters.region} AS customer_id)',
    columns: [{ reference: 'customer_id', type: DimensionType.NUMBER }],
    parameters: { region: 'EU' },
};

const buildService = (existing: Explore | null = virtualView) => {
    const projectModel = {
        getSummary: vi.fn(async () => ({ projectUuid, organizationUuid })),
        findVirtualViewsFromCache: vi.fn(async () =>
            existing ? { [existing.name]: existing } : {},
        ),
        findExploresFromCache: vi.fn(async () =>
            existing ? { [existing.name]: existing } : {},
        ),
    };
    const projectService = {
        validateVirtualViewParameterReferences: vi.fn(async () => undefined),
        createVirtualView: vi.fn(async () => ({ name: asCode.slug })),
        updateVirtualView: vi.fn(async () => ({ name: asCode.slug })),
    };
    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: projectModel as never,
        savedChartModel: {} as never,
        savedSqlModel: {} as never,
        appModel: {} as never,
        dashboardModel: {} as never,
        spaceModel: {} as never,
        schedulerModel: {} as never,
        schedulerService: {} as never,
        savedChartService: {} as never,
        dashboardService: {} as never,
        schedulerClient: {} as never,
        promoteService: {} as never,
        spacePermissionService: {} as never,
        contentAsCodeSnapshotModel: { upsert: vi.fn() } as never,
        contentAsCodeProjectSettingsModel: { upsert: vi.fn() } as never,
        contentVerificationModel: {} as never,
        projectService: projectService as never,
        groupsModel: {} as never,
        organizationMemberProfileModel: {} as never,
        userModel: {} as never,
    });
    return { service, projectService };
};

describe('CoderService virtual views as code', () => {
    test('exports a deterministic contract and removes exactly one SQL wrapper', async () => {
        const { service } = buildService();

        await expect(
            service.getVirtualViews(user, projectUuid),
        ).resolves.toEqual({
            virtualViews: [asCode],
            skipped: [],
            missingSlugs: [],
        });
    });

    test('excludes generated time interval dimensions from the exported columns', async () => {
        const withIntervals = {
            ...virtualView,
            tables: {
                orders_by_customer: {
                    ...virtualView.tables.orders_by_customer,
                    dimensions: {
                        ...virtualView.tables.orders_by_customer.dimensions,
                        order_date: {
                            name: 'order_date',
                            type: DimensionType.DATE,
                            isIntervalBase: true,
                        },
                        order_date_month: {
                            name: 'order_date_month',
                            type: DimensionType.DATE,
                            timeInterval: TimeFrames.MONTH,
                            timeIntervalBaseDimensionName: 'order_date',
                        },
                    },
                },
            },
        } as unknown as Explore;
        const { service } = buildService(withIntervals);

        const result = await service.getVirtualViews(user, projectUuid);

        expect(result.virtualViews[0].columns).toEqual([
            { reference: 'customer_id', type: DimensionType.NUMBER },
            { reference: 'order_date', type: DimensionType.DATE },
        ]);
    });

    test('returns no changes for an identical second apply', async () => {
        const { service, projectService } = buildService();

        await expect(
            service.upsertVirtualView(
                user as never,
                projectUuid,
                asCode.slug,
                asCode,
            ),
        ).resolves.toEqual({ action: PromotionAction.NO_CHANGES });
        expect(projectService.updateVirtualView).not.toHaveBeenCalled();
    });

    test('blocks destructive column changes unless forced', async () => {
        const { service, projectService } = buildService();
        const changed = {
            ...asCode,
            columns: [
                {
                    reference: 'customer_id',
                    type: DimensionType.STRING,
                },
            ],
        };

        await expect(
            service.upsertVirtualView(
                user as never,
                projectUuid,
                asCode.slug,
                changed,
            ),
        ).rejects.toThrow('require force');
        await expect(
            service.upsertVirtualView(
                user as never,
                projectUuid,
                asCode.slug,
                changed,
                true,
            ),
        ).resolves.toEqual({ action: PromotionAction.UPDATE });
        expect(projectService.updateVirtualView).toHaveBeenCalledOnce();
    });

    test('creates by immutable slug while preserving the display label', async () => {
        const { service, projectService } = buildService(null);

        await expect(
            service.upsertVirtualView(
                user as never,
                projectUuid,
                asCode.slug,
                asCode,
            ),
        ).resolves.toEqual({ action: PromotionAction.CREATE });
        expect(projectService.createVirtualView).toHaveBeenCalledWith(
            user,
            projectUuid,
            expect.objectContaining({
                name: asCode.slug,
                label: asCode.name,
            }),
            false,
        );
    });

    test('rejects a non-virtual explore collision', async () => {
        const { service } = buildService({
            ...virtualView,
            type: ExploreType.DEFAULT,
        });

        await expect(
            service.upsertVirtualView(
                user as never,
                projectUuid,
                asCode.slug,
                asCode,
            ),
        ).rejects.toThrow('cannot be adopted');
    });
});
