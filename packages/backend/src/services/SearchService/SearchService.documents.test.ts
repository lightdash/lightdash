import {
    defineUserAbility,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    type DocumentSearchResult,
    type SearchResults,
    type SessionUser,
} from '@lightdash/common';
import { DocumentService } from '../DocumentService/DocumentService';
import { SearchService } from './SearchService';

const projectUuid = 'project';
const organizationUuid = 'organization';
const userUuid = 'reader';
const ability = defineUserAbility(
    {
        userUuid,
        organizationUuid,
        role: OrganizationMemberRole.INTERACTIVE_VIEWER,
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
const document: DocumentSearchResult = {
    uuid: 'document',
    slug: 'weekly-review',
    name: 'Weekly review',
    description: 'Narrative',
    projectUuid,
    spaceUuid: 'private-space',
    createdBy: null,
    search_rank: 100,
};

const setup = ({ enabled = true, granted = true } = {}) => {
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ projectUuid, organizationUuid }),
    };
    const featureFlagModel = { get: vi.fn().mockResolvedValue({ enabled }) };
    const resolveAccessBatch = vi.fn().mockResolvedValue([
        {
            context: {
                organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject: false,
                directOnly: true,
                access: granted
                    ? [
                          {
                              userUuid,
                              role: 'viewer',
                              hasDirectAccess: true,
                              grantedVia: 'document',
                          },
                      ]
                    : [],
            },
        },
    ]);
    const documentModel = {
        listSpaceUuids: vi.fn().mockResolvedValue([]),
        listSummariesByUuid: vi.fn().mockResolvedValue([
            {
                ...document,
                documentUuid: document.uuid,
                organizationUuid,
            },
        ]),
    };
    const documentService = new DocumentService({
        projectModel,
        featureFlagModel,
        documentModel,
        directAccessService: {
            findSharedWithMeUuids: vi.fn().mockResolvedValue({
                document: granted ? [document.uuid] : [],
            }),
        },
        spacePermissionService: { resolveAccessBatch },
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    const results: SearchResults = {
        documents: [document],
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
    const searchModel = { search: vi.fn().mockResolvedValue(results) };
    const service = new SearchService({
        documentService,
        projectModel: projectModel as never,
        searchModel: searchModel as never,
        analytics: { track: vi.fn() } as never,
        spaceModel: {} as never,
        userAttributesModel: {} as never,
        spacePermissionService: {
            getAccessibleSpaceUuids: vi.fn().mockResolvedValue([]),
            resolveAccessBatch: vi.fn().mockResolvedValue([]),
        } as never,
    });
    return {
        service,
        searchModel,
        featureFlagModel,
        resolveAccessBatch,
        documentModel,
    };
};

describe('Document global search authorization', () => {
    it('returns direct-granted Documents without space access using canonical authorization', async () => {
        const { service, searchModel, resolveAccessBatch, featureFlagModel } =
            setup();
        const results = await service.getSearchResults(
            user,
            projectUuid,
            'Weekly',
        );
        expect(results.documents).toEqual([document]);
        expect(searchModel.search).toHaveBeenCalledWith(
            projectUuid,
            'Weekly',
            undefined,
            expect.anything(),
            {
                spaceUuids: [],
                documentUuids: [document.uuid],
            },
        );
        expect(resolveAccessBatch).toHaveBeenCalledWith(userUuid, [
            {
                type: 'document',
                documentUuid: document.uuid,
                spaceUuid: document.spaceUuid,
            },
        ]);
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.Documents,
            user: { userUuid, organizationUuid },
        });
    });

    it.each([
        { enabled: false, granted: true },
        { enabled: true, granted: false },
    ])(
        'hides Documents when flag/access disallows them: %j',
        async (options) => {
            const { service } = setup(options);
            expect(
                (await service.getSearchResults(user, projectUuid, 'Weekly'))
                    .documents,
            ).toEqual([]);
        },
    );

    it('does not fetch Document candidates when the feature is disabled', async () => {
        const { service, searchModel } = setup({ enabled: false });
        await service.getSearchResults(user, projectUuid, 'Weekly');
        expect(searchModel.search).toHaveBeenCalledWith(
            projectUuid,
            'Weekly',
            undefined,
            expect.anything(),
            undefined,
        );
    });

    it('rechecks revoked access on the next search', async () => {
        const { service, resolveAccessBatch } = setup();
        expect(
            (await service.getSearchResults(user, projectUuid, 'Weekly'))
                .documents,
        ).toHaveLength(1);
        resolveAccessBatch.mockResolvedValue([
            {
                context: {
                    organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject: false,
                    directOnly: true,
                    access: [],
                },
            },
        ]);
        expect(
            (await service.getSearchResults(user, projectUuid, 'Weekly'))
                .documents,
        ).toEqual([]);
    });

    it('drops Documents removed between the index query and authorization', async () => {
        const { service, documentModel } = setup();
        documentModel.listSummariesByUuid.mockResolvedValue([]);
        expect(
            (await service.getSearchResults(user, projectUuid, 'Weekly'))
                .documents,
        ).toEqual([]);
    });

    it('rejects an unauthorized project', async () => {
        const { service } = setup();
        await expect(
            service.getSearchResults(
                {
                    ...user,
                    ability: defineUserAbility(
                        {
                            userUuid,
                            organizationUuid: 'other-organization',
                            role: OrganizationMemberRole.INTERACTIVE_VIEWER,
                            roleUuid: undefined,
                        },
                        [],
                    ),
                },
                projectUuid,
                'Weekly',
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });
});
