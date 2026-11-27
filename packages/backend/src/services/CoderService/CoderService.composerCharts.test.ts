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
import { CoderService } from './CoderService';
import { SpaceOwnedComposerChartUploadError } from './composerChartsAsCode';

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
        const otherProjectUuid = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
        const service = makeService([spaceChart('in-space')]);
        // The other project's chart shares the slug; findForCode only sees this project's
        const model = (service as AnyType).composerChartModel;
        model.get.mockResolvedValueOnce({
            ...spaceChart('in-space'),
            uuid: otherProjectUuid,
        });

        await expect(
            service.getComposerChartForRead(
                account,
                PROJECT_UUID,
                otherProjectUuid,
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
                account,
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
            account,
            PROJECT_UUID,
            'visible',
            editedFile(),
            { authorization: 'space_access' },
        );
        expect(writeFromCode).toHaveBeenCalledOnce();
    });

    const withoutDashboard = (): AnyType => {
        const { dashboardSlug: _, ...file } = editedFile();
        return { ...file, name: 'visible' };
    };

    it.each([
        ['names no dashboard', { ...withoutDashboard(), dashboardSlug: null }],
        ['omits its dashboard', withoutDashboard()],
    ])('refuses a file that %s, even unchanged', async (_, file) => {
        const { service, writeFromCode } = makeUpsertService();
        await expect(
            service.upsertComposerChart(
                user,
                account,
                PROJECT_UUID,
                'visible',
                file,
                { authorization: 'space_access' },
            ),
        ).rejects.toThrow(SpaceOwnedComposerChartUploadError);
        expect(writeFromCode).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'refuses a file for a space-owned chart (deleted: %s), even naming a dashboard',
        async (deleted) => {
            const { service, writeFromCode } = makeUpsertService({
                owner: { type: 'space', spaceUuid: 'marketing-uuid' },
                deleted,
            });
            await expect(
                service.upsertComposerChart(
                    user,
                    account,
                    PROJECT_UUID,
                    'visible',
                    { ...editedFile(), name: 'visible' },
                    { authorization: 'space_access' },
                ),
            ).rejects.toThrow(SpaceOwnedComposerChartUploadError);
            expect(writeFromCode).not.toHaveBeenCalled();
        },
    );
});
