import {
    ChartKind,
    defineUserAbility,
    OrganizationMemberRole,
    type ComposerChartSearchResult,
    type SearchResults,
    type SessionUser,
} from '@lightdash/common';
import { SearchService } from './SearchService';

const projectUuid = 'project';
const organizationUuid = 'organization';
const userUuid = 'reader';
const ability = defineUserAbility(
    {
        userUuid,
        organizationUuid,
        role: OrganizationMemberRole.VIEWER,
        roleUuid: undefined,
    },
    [],
);
const user = {
    userUuid,
    organizationUuid,
    ability,
    abilityRules: ability.rules,
} as SessionUser;

const composerChart = (
    uuid: string,
    spaceUuid: string,
): ComposerChartSearchResult => ({
    uuid,
    slug: uuid,
    name: `Revenue ${uuid}`,
    description: null,
    spaceUuid,
    projectUuid,
    chartType: ChartKind.LINE,
    createdBy: null,
    search_rank: 1,
});
const visible = composerChart('visible', 'shared-space');
const hidden = composerChart('hidden', 'private-space');

const spaceContext = (spaceUuid: string) => ({
    organizationUuid,
    projectUuid,
    inheritsFromOrgOrProject: false,
    access:
        spaceUuid === 'shared-space'
            ? [{ userUuid, role: 'viewer', hasDirectAccess: true }]
            : [],
});

const setup = ({ enabled }: { enabled: boolean }) => {
    const results: SearchResults = {
        composerCharts: [visible, hidden],
        documents: [],
        dashboards: [],
        dashboardTabs: [],
        savedCharts: [],
        sqlCharts: [],
        spaces: [],
        fields: [],
        tables: [],
        pages: [],
        dataApps: [],
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled }),
        getDisabledLiveIntegrations: vi.fn().mockResolvedValue(new Set()),
    };
    const resolveAccessBatch = vi.fn(
        async (_userUuid: string, targets: { spaceUuid: string }[]) =>
            targets.map(({ spaceUuid }) => ({
                context: spaceContext(spaceUuid),
            })),
    );
    const service = new SearchService({
        documentService: {} as never,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ projectUuid, organizationUuid }),
        } as never,
        searchModel: { search: vi.fn().mockResolvedValue(results) } as never,
        analytics: { track: vi.fn() } as never,
        spaceModel: {} as never,
        featureFlagModel: featureFlagModel as never,
        userAttributesModel: {} as never,
        spacePermissionService: {
            getAccessibleSpaceUuids: vi.fn().mockResolvedValue([]),
            resolveAccessBatch,
        } as never,
    });
    return { service };
};

describe('composer chart search', () => {
    it('returns only charts whose space lets the user view charts', async () => {
        const { service } = setup({ enabled: true });
        const results = await service.getSearchResults(
            user,
            projectUuid,
            'revenue',
        );
        expect(results.composerCharts).toEqual([visible]);
    });

    it('returns none when composer-charts is off', async () => {
        const { service } = setup({ enabled: false });
        const results = await service.getSearchResults(
            user,
            projectUuid,
            'revenue',
        );
        expect(results.composerCharts).toEqual([]);
    });
});
