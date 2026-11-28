import { Ability, type RawRuleOf } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    type AnyType,
    type ComposerChart,
    type PossibleAbilities,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account';
import { CoderService } from './CoderService';
import { ComposerChartOwnerChangeError } from './composerChartsAsCode';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';

const user = {
    userUuid: 'user-uuid',
    organizationUuid: ORG_UUID,
    role: OrganizationMemberRole.MEMBER,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ContentAsCode',
            action: 'view',
        } as RawRuleOf<Ability<PossibleAbilities>>,
        // Space access alone must not reveal a chart whose dashboard is hidden
        { subject: 'Space', action: 'view' } as RawRuleOf<
            Ability<PossibleAbilities>
        >,
    ]),
    abilityRules: [],
} as unknown as SessionUser;

const storedChart = (uuid: string): AnyType => ({
    uuid,
    slug: uuid,
    name: uuid,
    description: null,
    dashboardUuid: `${uuid}-dashboard`,
    dashboardSlug: `${uuid}-dashboard`,
    spaceUuid: 'space-uuid',
    spacePath: 'jaffle',
    pipeline: { schemaVersion: 1, terminalNodeId: 'n', nodes: [] },
    chart: {
        schemaVersion: 1,
        columns: [],
        chartConfig: { type: 'table' },
        pivotConfig: null,
        tableConfig: { columnOrder: [] },
    },
    updatedAt: new Date(),
});

const makeService = (
    charts: AnyType[] = [storedChart('visible'), storedChart('hidden')],
) => {
    const assertCanView = vi.fn(
        async (_account: unknown, _project: string, uuid: string) => {
            if (uuid === 'hidden') throw new ForbiddenError();
            return { organizationUuid: ORG_UUID, dashboardUuid: uuid };
        },
    );
    return new CoderService({
        lightdashConfig: { contentAsCode: { maxDownloads: 100 } },
        projectModel: {
            getSummary: vi.fn(async () => ({ organizationUuid: ORG_UUID })),
        },
        appModel: { findAppsByUuids: vi.fn(async () => []) },
        composerChartModel: {
            findForCode: vi.fn(async (_project: string, slugs?: string[]) =>
                charts.filter(
                    (chart: ComposerChart) =>
                        !slugs || slugs.includes(chart.slug),
                ),
            ),
            getUuidByUuidOrSlug: vi.fn(async (project: string, id: string) => {
                const chart = charts.find(
                    (stored: ComposerChart) =>
                        (stored.projectUuid ?? PROJECT_UUID) === project &&
                        stored.uuid === id,
                );
                if (!chart) throw new NotFoundError('Composer chart not found');
                return chart.uuid;
            }),
            get: vi.fn(async (uuid: string) => {
                const chart = charts.find(
                    (stored: ComposerChart) => stored.uuid === uuid,
                );
                if (!chart) throw new NotFoundError('Composer chart not found');
                return chart;
            }),
        },
        composerChartService: { assertCanView },
    } as AnyType);
};

const account = { user: { userUuid: user.userUuid } } as RegisteredAccount;

const spaceChart = (uuid: string): AnyType => ({
    ...storedChart(uuid),
    owner: { type: 'space', spaceUuid: 'marketing-uuid' },
    dashboardUuid: undefined,
    dashboardSlug: null,
    spaceUuid: 'marketing-uuid',
    spacePath: 'marketing.growth',
});

describe('CoderService composer chart download', () => {
    it('writes a space-owned chart with no dashboard and its own space', async () => {
        const service = makeService([
            storedChart('on-dashboard'),
            spaceChart('in-space'),
        ]);

        const result = await service.getComposerCharts(
            user,
            account,
            PROJECT_UUID,
            undefined,
            undefined,
        );

        expect(
            result.composerCharts.map(({ slug, dashboardSlug, spaceSlug }) => ({
                slug,
                dashboardSlug,
                spaceSlug,
            })),
        ).toEqual([
            {
                slug: 'on-dashboard',
                dashboardSlug: 'on-dashboard-dashboard',
                spaceSlug: 'jaffle',
            },
            {
                slug: 'in-space',
                dashboardSlug: null,
                spaceSlug: 'marketing/growth',
            },
        ]);
    });

    it('leaves out a chart whose dashboard the caller cannot view', async () => {
        const result = await makeService().getComposerCharts(
            user,
            account,
            PROJECT_UUID,
            undefined,
            undefined,
        );

        expect(result.composerCharts.map(({ slug }) => slug)).toEqual([
            'visible',
        ]);
        expect(result.total).toBe(1);
    });

    it('refuses a download without the content as code permission', async () => {
        const viewer = {
            ...user,
            ability: new Ability<PossibleAbilities>([]),
        } as unknown as SessionUser;

        await expect(
            makeService().getComposerCharts(
                viewer,
                account,
                PROJECT_UUID,
                undefined,
                undefined,
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('CoderService composer chart read for the agent', () => {
    it('reads without the content as code permission, with the space that owns the chart', async () => {
        await expect(
            makeService([spaceChart('in-space')]).getComposerChartForRead(
                account,
                PROJECT_UUID,
                'in-space',
            ),
        ).resolves.toEqual({
            composerChart: expect.objectContaining({
                slug: 'in-space',
                dashboardSlug: null,
                spaceSlug: 'marketing/growth',
            }),
            composerChartUuid: 'in-space',
            spaceUuid: 'marketing-uuid',
        });
    });

    it('reads by the uuid a chart page link carries', async () => {
        const uuid = '7d4f2c1e-3b5a-4c6d-8e9f-0a1b2c3d4e5f';
        const service = makeService([
            { ...spaceChart('in-space'), uuid },
            spaceChart('other'),
        ]);

        await expect(
            service.getComposerChartForRead(account, PROJECT_UUID, uuid),
        ).resolves.toMatchObject({
            composerChart: { slug: 'in-space' },
            composerChartUuid: uuid,
        });
        await expect(
            service.getComposerChartForRead(
                account,
                PROJECT_UUID,
                '00000000-0000-4000-8000-000000000000',
            ),
        ).resolves.toBeNull();
    });

    it('misses a uuid from another project whose slug this project reuses', async () => {
        const otherProjectChart = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
        const service = makeService([
            spaceChart('in-space'),
            {
                ...spaceChart('in-space'),
                uuid: otherProjectChart,
                projectUuid: 'other-project-uuid',
            },
        ]);

        await expect(
            service.getComposerChartForRead(
                account,
                PROJECT_UUID,
                otherProjectChart,
            ),
        ).resolves.toBeNull();
    });

    it('hides a chart the caller cannot view', async () => {
        await expect(
            makeService([storedChart('hidden')]).getComposerChartForRead(
                account,
                PROJECT_UUID,
                'hidden',
            ),
        ).resolves.toBeNull();
    });
});

describe('CoderService composer chart upsert for the agent', () => {
    const editedFile = (): AnyType => ({
        ...storedChart('visible'),
        contentType: 'composer_chart',
        version: 1,
        name: 'Renamed',
        spaceSlug: 'jaffle',
    });
    const makeUpsertService = ({
        owner = { type: 'dashboard', dashboardUuid: 'd' },
        deleted = false,
    }: { owner?: AnyType; deleted?: boolean } = {}) => {
        const writeFromCode = vi.fn(async () => 'visible');
        const service = new CoderService({
            lightdashConfig: { contentAsCode: { maxDownloads: 100 } },
            projectModel: {
                get: vi.fn(async () => ({
                    projectUuid: PROJECT_UUID,
                    organizationUuid: ORG_UUID,
                })),
            },
            appModel: { findAppsByUuids: vi.fn(async () => []) },
            composerChartModel: {
                findIdentityBySlug: vi.fn(async () => ({
                    uuid: 'visible',
                    deleted,
                    owner,
                })),
                get: vi.fn(async () => storedChart('visible')),
            },
            composerChartService: {
                isEnabled: vi.fn(async () => true),
                assertCanView: vi.fn(async () => ({})),
                writeFromCode,
            },
        } as AnyType);
        return { service, writeFromCode };
    };
    const viewer = {
        ...user,
        ability: new Ability<PossibleAbilities>([]),
    } as unknown as SessionUser;

    it('needs the content as code permission by default', async () => {
        const { service, writeFromCode } = makeUpsertService();
        await expect(
            service.upsertComposerChart(
                viewer,
                fromSession(viewer),
                PROJECT_UUID,
                'visible',
                editedFile(),
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(writeFromCode).not.toHaveBeenCalled();
    });

    it('writes without the content as code permission with space access', async () => {
        const { service, writeFromCode } = makeUpsertService();
        await service.upsertComposerChart(
            viewer,
            fromSession(viewer),
            PROJECT_UUID,
            'visible',
            editedFile(),
            { authorization: 'space_access' },
        );
        expect(writeFromCode).toHaveBeenCalledOnce();
    });

    it('refuses a file taking a dashboard chart into a space', async () => {
        const { service, writeFromCode } = makeUpsertService();
        const { dashboardSlug: _, ...file } = editedFile();
        await expect(
            service.upsertComposerChart(
                user,
                fromSession(user),
                PROJECT_UUID,
                'visible',
                file,
                { authorization: 'space_access' },
            ),
        ).rejects.toThrow(
            /belongs to a dashboard.*cannot move a chart from a dashboard to a space/,
        );
        expect(writeFromCode).not.toHaveBeenCalled();
    });
});

describe('CoderService composer chart upload into a space', () => {
    const SPACE_PATH = 'marketing';
    const uploader = {
        ...user,
        ability: new Ability<PossibleAbilities>([
            { subject: 'ContentAsCode', action: 'create' },
            { subject: 'Space', action: 'create' },
        ] as RawRuleOf<Ability<PossibleAbilities>>[]),
    } as unknown as SessionUser;
    const uploaderAccount = fromSession(uploader);
    const spaceFile = (spaceSlug = SPACE_PATH): AnyType => ({
        ...storedChart('visible'),
        contentType: 'composer_chart',
        version: 1,
        dashboardSlug: null,
        spaceSlug,
    });
    const setup = ({
        existing = null,
        spaces = [{ uuid: 'marketing-uuid', path: SPACE_PATH }],
        flagEnabled = true,
        composerChartService = {},
    }: {
        existing?: AnyType;
        spaces?: Array<{ uuid: string; path: string }>;
        flagEnabled?: boolean;
        composerChartService?: Record<string, AnyType>;
    } = {}) => {
        const chartService = {
            isEnabled: vi.fn(async () => flagEnabled),
            assertCanView: vi.fn(async () => ({})),
            preflightWrite: vi.fn(async () => undefined),
            preflightSpaceChartEdit: vi.fn(async () => undefined),
            writeFromCode: vi.fn(async () => 'visible'),
            moveToSpace: vi.fn(async () => undefined),
            ...composerChartService,
        };
        const dashboardModel = { find: vi.fn(), create: vi.fn() };
        const service = new CoderService({
            lightdashConfig: { contentAsCode: { maxDownloads: 100 } },
            projectModel: {
                get: vi.fn(async () => ({
                    projectUuid: PROJECT_UUID,
                    organizationUuid: ORG_UUID,
                })),
            },
            appModel: { findAppsByUuids: vi.fn(async () => []) },
            dashboardModel,
            composerChartModel: {
                findIdentityBySlug: vi.fn(async () => existing),
                get: vi.fn(async () => storedChart('visible')),
            },
            composerChartService: chartService,
            spaceModel: {
                find: vi.fn(async ({ path }: { path: string }) =>
                    spaces.filter((space) => space.path === path),
                ),
                getSpaceSummary: vi.fn(async (uuid: string) => ({
                    uuid,
                    path: uuid === 'jaffle-uuid' ? 'jaffle' : SPACE_PATH,
                })),
                findClosestAncestorByPath: vi.fn(
                    async ({ path }: { path: string }) =>
                        spaces.find((space) =>
                            path.startsWith(`${space.path}.`),
                        )?.uuid ?? null,
                ),
            },
            spacePermissionService: { can: vi.fn(async () => true) },
        } as AnyType);
        const getOrCreateSpace = vi
            .spyOn(service, 'getOrCreateSpace')
            .mockImplementation(async (_project, spaceSlug) => ({
                space: {
                    uuid:
                        spaces.find(({ path }) => path === spaceSlug)?.uuid ??
                        'new-space-uuid',
                } as AnyType,
                created: !spaces.some(({ path }) => path === spaceSlug),
            }));
        const upload = (file: AnyType, options = {}) =>
            service.upsertComposerChart(
                uploader,
                uploaderAccount,
                PROJECT_UUID,
                'visible',
                file,
                options,
            );
        return {
            upload,
            chartService,
            dashboardModel,
            getOrCreateSpace,
        };
    };
    const liveInJaffle = {
        uuid: 'visible',
        deleted: false,
        owner: { type: 'space', spaceUuid: 'jaffle-uuid' },
    };

    it('creates a chart in its space after every write check, with no placeholder dashboard', async () => {
        const { upload, chartService, dashboardModel } = setup();
        await expect(upload(spaceFile())).resolves.toEqual({
            action: 'create',
            composerChartUuid: 'visible',
        });
        expect(chartService.preflightWrite).toHaveBeenCalledOnce();
        expect(chartService.writeFromCode).toHaveBeenCalledWith(
            uploaderAccount,
            PROJECT_UUID,
            expect.objectContaining({
                slug: 'visible',
                owner: { type: 'space', spaceUuid: 'marketing-uuid' },
                spaceOwner: 'refuse',
            }),
        );
        expect(dashboardModel.find).not.toHaveBeenCalled();
        expect(dashboardModel.create).not.toHaveBeenCalled();
    });

    it('creates a missing space, honouring skipSpaceCreate and the space create permission', async () => {
        const { upload, chartService, getOrCreateSpace } = setup({
            spaces: [],
        });
        await upload(spaceFile('marketing/new'), { skipSpaceCreate: false });
        expect(getOrCreateSpace).toHaveBeenCalledWith(
            PROJECT_UUID,
            'marketing/new',
            uploader,
            false,
            undefined,
            undefined,
            true,
        );
        expect(chartService.writeFromCode).toHaveBeenCalledWith(
            uploaderAccount,
            PROJECT_UUID,
            expect.objectContaining({
                owner: { type: 'space', spaceUuid: 'new-space-uuid' },
            }),
        );
    });

    it('creates no space for a chart its checks refuse', async () => {
        const { upload, chartService, getOrCreateSpace } = setup({
            spaces: [],
            composerChartService: {
                preflightWrite: vi.fn(async () => {
                    throw new ForbiddenError('no sql');
                }),
            },
        });
        await expect(upload(spaceFile('marketing/new'))).rejects.toThrow(
            'no sql',
        );
        expect(getOrCreateSpace).not.toHaveBeenCalled();
        expect(chartService.writeFromCode).not.toHaveBeenCalled();
    });

    it('revives a deleted chart in the space the file names', async () => {
        const { upload, chartService } = setup({
            existing: { ...liveInJaffle, deleted: true },
        });
        await expect(upload(spaceFile())).resolves.toMatchObject({
            action: 'create',
        });
        expect(chartService.assertCanView).not.toHaveBeenCalled();
        expect(chartService.writeFromCode).toHaveBeenCalledWith(
            uploaderAccount,
            PROJECT_UUID,
            expect.objectContaining({
                owner: { type: 'space', spaceUuid: 'marketing-uuid' },
            }),
        );
    });

    it.each([true, false])(
        'writes nothing for an identical file (flag on: %s), after checking view on the chart',
        async (flagEnabled) => {
            const { upload, chartService } = setup({
                existing: liveInJaffle,
                flagEnabled,
            });
            await expect(upload(spaceFile('jaffle'))).resolves.toEqual({
                action: 'no changes',
                composerChartUuid: 'visible',
            });
            expect(chartService.assertCanView).toHaveBeenCalledWith(
                uploaderAccount,
                PROJECT_UUID,
                'visible',
            );
            expect(chartService.writeFromCode).not.toHaveBeenCalled();
            expect(chartService.moveToSpace).not.toHaveBeenCalled();
        },
    );

    it('moves a chart whose spaceSlug changed, writing no version', async () => {
        const { upload, chartService } = setup({ existing: liveInJaffle });
        await expect(upload(spaceFile())).resolves.toEqual({
            action: 'update',
            composerChartUuid: 'visible',
        });
        expect(chartService.preflightSpaceChartEdit).toHaveBeenCalledWith(
            uploaderAccount,
            PROJECT_UUID,
            'visible',
            { targetSpaceUuid: 'marketing-uuid' },
        );
        expect(chartService.moveToSpace).toHaveBeenCalledWith(uploaderAccount, {
            projectUuid: PROJECT_UUID,
            itemUuid: 'visible',
            targetSpaceUuid: 'marketing-uuid',
        });
        expect(chartService.writeFromCode).not.toHaveBeenCalled();
    });

    it('writes a changed chart in its space, then moves it', async () => {
        const { upload, chartService } = setup({ existing: liveInJaffle });
        await upload({ ...spaceFile(), name: 'Renamed' });
        expect(chartService.writeFromCode).toHaveBeenCalledWith(
            uploaderAccount,
            PROJECT_UUID,
            expect.objectContaining({
                name: 'Renamed',
                owner: null,
                spaceOwner: 'keep',
            }),
        );
        expect(
            chartService.writeFromCode.mock.invocationCallOrder[0],
        ).toBeLessThan(chartService.moveToSpace.mock.invocationCallOrder[0]);
    });

    it.each([
        ['creating', null],
        ['moving', liveInJaffle],
    ])(
        'refuses %s into a path two spaces share, or under one',
        async (_, existing) => {
            const { upload, chartService, getOrCreateSpace } = setup({
                existing,
                spaces: [
                    { uuid: 'marketing-uuid', path: SPACE_PATH },
                    { uuid: 'other-marketing-uuid', path: SPACE_PATH },
                ],
            });
            await expect(upload(spaceFile())).rejects.toThrow(
                'More than one space has the path "marketing"',
            );
            await expect(upload(spaceFile('marketing/new'))).rejects.toThrow(
                'cannot be uploaded to "marketing/new"',
            );
            expect(getOrCreateSpace).not.toHaveBeenCalled();
            expect(chartService.writeFromCode).not.toHaveBeenCalled();
            expect(chartService.moveToSpace).not.toHaveBeenCalled();
        },
    );

    it.each([
        ['creating', null],
        ['moving', liveInJaffle],
    ])('refuses %s with an empty spaceSlug', async (_, existing) => {
        const { upload, chartService, getOrCreateSpace } = setup({ existing });
        await expect(upload(spaceFile(''))).rejects.toThrow(
            'needs a spaceSlug or a dashboardSlug',
        );
        expect(getOrCreateSpace).not.toHaveBeenCalled();
        expect(chartService.writeFromCode).not.toHaveBeenCalled();
        expect(chartService.moveToSpace).not.toHaveBeenCalled();
    });

    it('checks write on the chart before creating a missing target space', async () => {
        const { upload, chartService, getOrCreateSpace } = setup({
            existing: liveInJaffle,
            spaces: [],
            composerChartService: {
                preflightSpaceChartEdit: vi.fn(async () => {
                    throw new ForbiddenError('no write');
                }),
            },
        });
        await expect(upload(spaceFile('marketing/new'))).rejects.toThrow(
            'no write',
        );
        expect(getOrCreateSpace).not.toHaveBeenCalled();
        expect(chartService.moveToSpace).not.toHaveBeenCalled();
    });

    it.each([
        ['a space chart, onto a dashboard', liveInJaffle, 'ops'],
        [
            'a dashboard chart, into a space',
            {
                ...liveInJaffle,
                owner: { type: 'dashboard', dashboardUuid: 'd' },
            },
            null,
        ],
    ])(
        'refuses %s the uploader cannot view before naming its owner',
        async (_, existing, dashboardSlug) => {
            const { upload, chartService } = setup({
                existing,
                composerChartService: {
                    assertCanView: vi.fn(async () => {
                        throw new ForbiddenError(
                            "You don't have permission to view this composer chart",
                        );
                    }),
                },
            });
            await expect(
                upload({ ...spaceFile('jaffle'), dashboardSlug }),
            ).rejects.toThrow('view this composer chart');
            expect(chartService.writeFromCode).not.toHaveBeenCalled();
        },
    );

    it.each([
        ['a new chart', null, spaceFile()],
        [
            'a changed chart',
            liveInJaffle,
            { ...spaceFile('jaffle'), name: 'Renamed' },
        ],
        ['a moved chart', liveInJaffle, spaceFile()],
    ])('refuses %s with the flag off, by name', async (_, existing, file) => {
        const { upload, chartService } = setup({
            existing,
            flagEnabled: false,
        });
        await expect(upload(file)).rejects.toThrow(
            'composer chart "visible" cannot be created or changed',
        );
        expect(chartService.writeFromCode).not.toHaveBeenCalled();
        expect(chartService.moveToSpace).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'refuses putting a chart its space owns on a dashboard (deleted: %s)',
        async (deleted) => {
            const { upload, chartService } = setup({
                existing: { ...liveInJaffle, deleted },
            });
            await expect(
                upload({ ...spaceFile('jaffle'), dashboardSlug: 'ops' }),
            ).rejects.toThrow(ComposerChartOwnerChangeError);
            expect(chartService.writeFromCode).not.toHaveBeenCalled();
        },
    );

    it.each([false, true])(
        'refuses taking a dashboard chart into a space (deleted: %s)',
        async (deleted) => {
            const { upload, chartService } = setup({
                existing: {
                    uuid: 'visible',
                    deleted,
                    owner: { type: 'dashboard', dashboardUuid: 'd' },
                },
            });
            await expect(upload(spaceFile())).rejects.toThrow(
                ComposerChartOwnerChangeError,
            );
            expect(chartService.writeFromCode).not.toHaveBeenCalled();
        },
    );
});
