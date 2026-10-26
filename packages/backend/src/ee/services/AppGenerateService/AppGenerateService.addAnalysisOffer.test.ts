import { Ability } from '@casl/ability';
import {
    DATA_REFERENCE_EXTRACTOR_VERSION,
    ForbiddenError,
    ProjectType,
    SpaceMemberRole,
    type ExtractedDataReference,
    type PersistedDataAppDataReferences,
    type SessionUser,
} from '@lightdash/common';
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const USER_UUID = 'user-uuid';
const APP_UUID = '11111111-1111-4111-8111-111111111111';
const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const SPACE_UUID = 'space-uuid';

const app = {
    app_id: APP_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORGANIZATION_UUID,
    space_uuid: SPACE_UUID,
    created_by_user_uuid: 'owner-uuid',
    name: 'Sales app',
    template: null,
};

const location = { path: 'src/App.tsx', line: 1, column: 1 };

const QUERY_REFERENCE: ExtractedDataReference = {
    kind: 'query',
    explore: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total'],
    dimensionFilterFields: [],
    metricFilterFields: [],
    sortFields: [],
    parameterKeys: [],
    localFields: [],
    unresolved: [],
    location,
};

const EXTERNAL_FETCH_REFERENCE: ExtractedDataReference = {
    kind: 'externalFetch',
    alias: 'lightdash',
    path: '/api/v1/projects',
    unresolved: [],
    location,
};

const dataReferences = (
    references: ExtractedDataReference[],
): PersistedDataAppDataReferences => ({
    extractorVersion: DATA_REFERENCE_EXTRACTOR_VERSION,
    references,
    parseErrors: [],
    stats: {
        callSites: references.length,
        fullyResolved: references.length,
        partiallyResolved: 0,
        unresolved: 0,
    },
    usesAiAnalysis: false,
});

const versionRow = (
    references: PersistedDataAppDataReferences | null,
    addAnalysisDismissedAt: Date | null,
) => ({
    version: 1,
    status: 'ready' as const,
    app_thread_uuid: 'thread-1',
    thread_number: 1,
    prompt: 'prompt 1',
    status_message: null,
    status_history: [],
    error: null,
    resources: null,
    dependencies: null,
    viz_schema: null,
    data_references: references,
    thumbnail_captured_at: null,
    thumbnail_is_manual: null,
    agent_identity: null,
    created_at: new Date(),
    status_updated_at: new Date(),
    created_by_user_uuid: 'owner-uuid',
    created_by_user_first_name: 'Owner',
    created_by_user_last_name: 'User',
    add_analysis_dismissed_at: addAnalysisDismissedAt,
});

const buildUser = (canManage: boolean): SessionUser => {
    const ability = new Ability([
        {
            action: canManage ? 'manage' : 'view',
            subject: 'DataApp',
            conditions: {
                projectUuid: PROJECT_UUID,
                access: { $elemMatch: { userUuid: USER_UUID } },
            },
        },
    ]);
    return {
        userUuid: USER_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isActive: true,
        ability,
        abilityRules: ability.rules,
    } as unknown as SessionUser;
};

const buildService = ({
    references,
    addAnalysisDismissedAt = null,
}: {
    references: PersistedDataAppDataReferences | null;
    addAnalysisDismissedAt?: Date | null;
}) => {
    const row = versionRow(references, addAnalysisDismissedAt);
    const dismissAddAnalysisOffer = vi.fn().mockResolvedValue(undefined);
    const appModel = {
        getApp: async () => app,
        getAppByUuidOrSlug: async () => app,
        getVersion: async () => row,
        getLatestReadyVersion: async () => row,
        dismissAddAnalysisOffer,
        getAppWithVersions: async () => ({
            name: app.name,
            description: '',
            createdByUserUuid: app.created_by_user_uuid,
            organizationUuid: ORGANIZATION_UUID,
            spaceUuid: SPACE_UUID,
            spaceName: 'Space',
            template: null,
            slug: 'sales-app',
            viewsCount: 0,
            pinnedListUuid: null,
            pinnedListOrder: null,
            autoAnalysis: 'inherit',
            addAnalysisDismissedAt,
            currentThread: {
                app_thread_uuid: 'thread-1',
                thread_number: 1,
                created_at: new Date(),
            },
            versions: [row],
            hasMore: false,
        }),
    };
    const accessContext = {
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        inheritsFromOrgOrProject: false,
        admins: [],
        access: [
            {
                userUuid: USER_UUID,
                role: SpaceMemberRole.EDITOR,
                hasDirectAccess: true,
                grantedVia: 'app' as const,
            },
        ],
        directOnly: false,
    };
    const service = new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: { appRuntime: {} } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: async () => ({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: async () => ({
                organizationUuid: ORGANIZATION_UUID,
                type: ProjectType.DEFAULT,
                createdByUserUuid: 'project-owner-uuid',
                upstreamProjectUuid: null,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: async () => accessContext,
            resolveAccessBatch: async () => [{ context: accessContext }],
        } as never,
        coderService: {} as never,
        documentService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: buildAppThumbnailClientMock({
            appModel: appModel as never,
        }),
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
        } as never,
    });
    return { service, dismissAddAnalysisOffer };
};

describe('AppGenerateService add-analysis offer', () => {
    it('reports analyzable data when the ready version runs queries', async () => {
        const { service } = buildService({
            references: dataReferences([
                QUERY_REFERENCE,
                EXTERNAL_FETCH_REFERENCE,
            ]),
        });

        const result = await service.getAppVersions(
            buildUser(true),
            PROJECT_UUID,
            APP_UUID,
            {},
        );

        expect(result.latestReadyVersionHasAnalyzableData).toBe(true);
        expect(result.latestReadyVersionUsesAiAnalysis).toBe(false);
        expect(result.addAnalysisDismissed).toBe(false);
    });

    it('reports no analyzable data when the app only calls external connections', async () => {
        const { service } = buildService({
            references: dataReferences([EXTERNAL_FETCH_REFERENCE]),
        });

        const result = await service.getAppVersions(
            buildUser(true),
            PROJECT_UUID,
            APP_UUID,
            {},
        );

        expect(result.latestReadyVersionHasAnalyzableData).toBe(false);
    });

    it('reports the persisted dismissal', async () => {
        const { service } = buildService({
            references: dataReferences([QUERY_REFERENCE]),
            addAnalysisDismissedAt: new Date('2026-10-26T09:00:00Z'),
        });

        const result = await service.getAppVersions(
            buildUser(true),
            PROJECT_UUID,
            APP_UUID,
            {},
        );

        expect(result.addAnalysisDismissed).toBe(true);
    });

    it('lets a manager dismiss the offer', async () => {
        const { service, dismissAddAnalysisOffer } = buildService({
            references: dataReferences([QUERY_REFERENCE]),
        });

        await service.dismissAddAnalysisOffer(
            buildUser(true),
            PROJECT_UUID,
            APP_UUID,
        );

        expect(dismissAddAnalysisOffer).toHaveBeenCalledWith(
            APP_UUID,
            PROJECT_UUID,
        );
    });

    it('refuses the dismissal to a user who can only view the app', async () => {
        const { service, dismissAddAnalysisOffer } = buildService({
            references: dataReferences([QUERY_REFERENCE]),
        });

        await expect(
            service.dismissAddAnalysisOffer(
                buildUser(false),
                PROJECT_UUID,
                APP_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(dismissAddAnalysisOffer).not.toHaveBeenCalled();
    });
});
