import { Ability } from '@casl/ability';
import {
    AgentCapability,
    ChartType,
    CustomDimensionType,
    FeatureNotEnabledError,
    FieldType,
    ForbiddenError,
    MergeJoinType,
    QuerySourceType,
    TableCalculationType,
    type ComposerChartPipelineNode,
    type CreateComposerChart,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromOauth, fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';
import type { ComposerChartModel } from '../../models/ComposerChartModel';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ComposerChartService } from './ComposerChartService';

const projectUuid = grantFixture().approvedProjectUuids[0];
const organizationUuid = defaultSessionUser.organizationUuid!;
const dashboardUuid = 'dashboard-uuid';

const AUTHOR_SUBJECTS = [
    'ComposerChart',
    'SqlRunner',
    'Explore',
    'MergeQuery',
    'CustomFields',
    'CustomSqlTableCalculations',
] as const;

const abilityWithout = (missing: string | null) =>
    new Ability<PossibleAbilities>([
        { subject: 'Dashboard', action: ['view' as const, 'update' as const] },
        ...AUTHOR_SUBJECTS.filter((name) => name !== missing).map((name) => ({
            subject: name,
            action: 'manage' as const,
        })),
    ]);

const sessionAccount = (ability: Ability<PossibleAbilities>) =>
    fromSession({ ...defaultSessionUser, ability }, 'session-cookie');

const semantic = (
    extra: Partial<
        Extract<
            ComposerChartPipelineNode,
            { sourceType: QuerySourceType.SEMANTIC_LAYER }
        >
    > = {},
): ComposerChartPipelineNode => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    ...extra,
});

const reading = (
    node: ComposerChartPipelineNode,
): ComposerChartPipelineNode[] => [
    semantic(),
    { ...semantic(), nodeId: 'other', title: 'Other' },
    node,
];

const PIPELINES: Record<string, ComposerChartPipelineNode[]> = {
    sql: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'result',
            title: 'Result',
            sql: 'select 1',
        },
    ],
    duckdb: reading({
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'result',
        title: 'Result',
        sql: 'select * from orders join other using (orders_status)',
        references: ['orders', 'other'],
    }),
    python: reading({
        sourceType: QuerySourceType.PYTHON,
        nodeId: 'result',
        title: 'Result',
        code: 'def run(inputs, params): return inputs["orders"]',
        references: ['orders', 'other'],
    }),
    merge: reading({
        sourceType: QuerySourceType.MERGE,
        nodeId: 'result',
        title: 'Result',
        sources: [{ nodeId: 'orders' }, { nodeId: 'other' }],
        joinKey: [],
        joinType: MergeJoinType.FULL,
    }),
    customSqlDimension: [
        semantic({
            nodeId: 'result',
            customDimensions: [
                {
                    id: 'status_upper',
                    name: 'status_upper',
                    table: 'orders',
                    type: CustomDimensionType.SQL,
                    sql: 'upper(${orders.status})',
                    dimensionType: 'string' as never,
                },
            ],
        }),
    ],
    sqlTableCalculation: [
        semantic({
            nodeId: 'result',
            tableCalculations: [
                {
                    name: 'doubled',
                    displayName: 'Doubled',
                    sql: '${orders.count} * 2',
                    type: TableCalculationType.NUMBER,
                },
            ],
        }),
    ],
};

const createBody = (
    nodes: ComposerChartPipelineNode[],
): CreateComposerChart => ({
    dashboardUuid,
    name: 'Orders',
    pipeline: { schemaVersion: 1, terminalNodeId: 'result', nodes },
    chart: {
        schemaVersion: 1,
        columns: [{ reference: 'n', fieldType: FieldType.METRIC }],
        chartConfig: { type: ChartType.TABLE, config: {} },
        pivotConfig: null,
        tableConfig: { columnOrder: ['n'] },
    },
});

const setup = ({ flagEnabled = true } = {}) => {
    const composerChartModel = {
        create: vi.fn(async () => 'chart-uuid'),
        get: vi.fn(async () => ({ uuid: 'chart-uuid' })),
    };
    const service = new ComposerChartService({
        composerChartModel: composerChartModel as unknown as ComposerChartModel,
        dashboardModel: {
            getSummaryByUuid: vi.fn(async () => ({
                projectUuid,
                organizationUuid,
                spaceUuid: 'space-uuid',
            })),
        } as unknown as DashboardModel,
        featureFlagModel: {
            get: vi.fn(async () => ({
                id: 'composer-charts',
                enabled: flagEnabled,
            })),
        } as unknown as FeatureFlagModel,
        spacePermissionService: {
            resolveAccess: vi.fn(async () => ({
                organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject: true,
                access: [],
                admins: [],
            })),
        } as unknown as SpacePermissionService,
    });
    return { service, composerChartModel };
};

describe('ComposerChartService.create', () => {
    test('writes a chart when the author holds every permission its nodes need', async () => {
        const { service, composerChartModel } = setup();
        await service.create(
            sessionAccount(abilityWithout(null)),
            projectUuid,
            createBody(PIPELINES.merge),
        );
        expect(composerChartModel.create).toHaveBeenCalledOnce();
    });

    test('is refused with the composer-charts flag off', async () => {
        const { service, composerChartModel } = setup({ flagEnabled: false });
        await expect(
            service.create(
                sessionAccount(abilityWithout(null)),
                projectUuid,
                createBody(PIPELINES.sql),
            ),
        ).rejects.toThrow(FeatureNotEnabledError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test.each([
        ['no manage:ComposerChart', 'ComposerChart', PIPELINES.sql],
        ['a sql node without SQL runner', 'SqlRunner', PIPELINES.sql],
        ['a duckdb node without Explore', 'Explore', PIPELINES.duckdb],
        ['a python node without Explore', 'Explore', PIPELINES.python],
        ['a merge node without Explore', 'Explore', PIPELINES.merge],
        [
            'a merge node without manage:MergeQuery',
            'MergeQuery',
            PIPELINES.merge,
        ],
        [
            'a custom SQL dimension without custom fields',
            'CustomFields',
            PIPELINES.customSqlDimension,
        ],
        [
            'a SQL table calculation without SQL table calculations',
            'CustomSqlTableCalculations',
            PIPELINES.sqlTableCalculation,
        ],
    ])('refuses %s', async (_, missing, nodes) => {
        const { service, composerChartModel } = setup();
        await expect(
            service.create(
                sessionAccount(abilityWithout(missing)),
                projectUuid,
                createBody(nodes),
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test('refuses an author who cannot update the dashboard', async () => {
        const { service } = setup();
        const ability = new Ability<PossibleAbilities>([
            { subject: 'Dashboard', action: 'view' as const },
            ...AUTHOR_SUBJECTS.map((name) => ({
                subject: name,
                action: 'manage' as const,
            })),
        ]);
        await expect(
            service.create(
                sessionAccount(ability),
                projectUuid,
                createBody(PIPELINES.sql),
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    test('refuses an agent connection without Raw SQL on a chart with sql nodes', async () => {
        const { service, composerChartModel } = setup();
        const grant = grantFixture();
        const account = fromOauth(
            { ...defaultSessionUser, ability: abilityWithout(null) },
            { accessToken: 'token', client: { id: grant.clientId } },
            null,
            { ...grant, revision: grant.grantRevision },
        );
        await expect(
            service.create(account, projectUuid, createBody(PIPELINES.sql)),
        ).rejects.toThrow('Raw SQL');
        expect(composerChartModel.create).not.toHaveBeenCalled();

        account.authentication.agentConnectionGrant!.approvedCapabilities.push(
            AgentCapability.RawSql,
        );
        await service.create(account, projectUuid, createBody(PIPELINES.sql));
        expect(composerChartModel.create).toHaveBeenCalledOnce();
    });
});
