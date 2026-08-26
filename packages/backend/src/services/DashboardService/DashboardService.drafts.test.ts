import { Ability } from '@casl/ability';
import {
    AnyType,
    PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardService } from './DashboardService';

const PROJECT_UUID = 'project-uuid';
const SPACE_UUID = 'space-uuid';

const editorUser = {
    userUuid: 'editor-uuid',
    ability: new Ability<PossibleAbilities>([]),
} as unknown as SessionUser;

const dashboardDao = {
    uuid: 'dashboard-uuid',
    projectUuid: PROJECT_UUID,
    organizationUuid: 'org-uuid',
    slug: 'weekly-kpis',
    name: 'Weekly KPIs',
    spaceUuid: SPACE_UUID,
    tiles: [],
    tabs: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
} as AnyType;

const draftFields = { name: 'Weekly KPIs (edited)' };

type Overrides = {
    settings?: object | undefined;
    snapshot?: object | undefined;
};

const buildService = (overrides: Overrides = {}) => {
    const settingsGet = vi
        .fn()
        .mockResolvedValue(
            'settings' in overrides
                ? overrides.settings
                : { syncEnabled: true },
        );
    const snapshotGet = vi
        .fn()
        .mockResolvedValue(
            'snapshot' in overrides
                ? overrides.snapshot
                : { snapshotHash: 'abc' },
        );
    const upsertOpenDraft = vi.fn().mockResolvedValue(undefined);
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        dashboardModel: {} as AnyType,
        spaceModel: {} as AnyType,
        analyticsModel: {} as AnyType,
        pinnedListModel: {} as AnyType,
        schedulerModel: {} as AnyType,
        searchModel: {} as AnyType,
        schedulerService: {} as AnyType,
        savedChartModel: {} as AnyType,
        savedSqlModel: {} as AnyType,
        savedChartService: {} as AnyType,
        projectModel: {
            get: vi.fn().mockResolvedValue({
                projectUuid: PROJECT_UUID,
                organizationUuid: 'org-uuid',
            }),
        } as AnyType,
        slackClient: {} as AnyType,
        schedulerClient: {} as AnyType,
        contentAsCodeProjectSettingsModel: { get: settingsGet } as AnyType,
        contentAsCodeSnapshotModel: { get: snapshotGet } as AnyType,
        contentDraftModel: { upsertOpenDraft } as AnyType,
        catalogModel: {} as AnyType,
        organizationModel: {} as AnyType,
        spacePermissionService: {
            getSpaceAccessContext: vi.fn().mockResolvedValue({
                inheritsFromOrgOrProject: true,
                access: [],
            }),
        } as AnyType,
        contentVerificationModel: {} as AnyType,
    });
    return { service, settingsGet, snapshotGet, upsertOpenDraft };
};

describe('DashboardService drafts gating (sync + git-backed only)', () => {
    afterEach(() => vi.clearAllMocks());

    it('stores a draft for git-backed content when sync is enabled', async () => {
        const { service, upsertOpenDraft } = buildService();
        const result = await service['maybeStoreDraft'](
            editorUser,
            dashboardDao,
            draftFields,
        );
        expect(upsertOpenDraft).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: PROJECT_UUID,
                contentType: 'dashboard',
                slug: dashboardDao.slug,
                authorUserUuid: editorUser.userUuid,
            }),
        );
        expect(result).toMatchObject({
            name: 'Weekly KPIs (edited)',
            hasUnpublishedChanges: true,
        });
    });

    it('publishes normally when the repo never opted into sync', async () => {
        const { service, snapshotGet, upsertOpenDraft } = buildService({
            settings: undefined,
        });
        const result = await service['maybeStoreDraft'](
            editorUser,
            dashboardDao,
            draftFields,
        );
        expect(result).toBeUndefined();
        expect(snapshotGet).not.toHaveBeenCalled();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('publishes normally for content that is not git-backed', async () => {
        const { service, upsertOpenDraft } = buildService({
            snapshot: undefined,
        });
        const result = await service['maybeStoreDraft'](
            editorUser,
            dashboardDao,
            draftFields,
        );
        expect(result).toBeUndefined();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('publishes normally for content-as-code managers', async () => {
        const { service, upsertOpenDraft } = buildService();
        const reviewer = {
            userUuid: 'reviewer-uuid',
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'ContentAsCode' },
            ]),
        } as unknown as SessionUser;
        const result = await service['maybeStoreDraft'](
            reviewer,
            dashboardDao,
            draftFields,
        );
        expect(result).toBeUndefined();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });
});
