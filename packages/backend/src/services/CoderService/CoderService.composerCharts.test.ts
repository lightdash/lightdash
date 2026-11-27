import { Ability, type RawRuleOf } from '@casl/ability';
import {
    ForbiddenError,
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
        spaceModel: {
            find: vi.fn(async () => [
                { uuid: 'space-uuid', path: 'jaffle' },
                { uuid: 'marketing-uuid', path: 'marketing.growth' },
            ]),
        },
        appModel: { findAppsByUuids: vi.fn(async () => []) },
        composerChartModel: {
            findForCode: vi.fn(async (): Promise<ComposerChart[]> => charts),
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
    it('reads without the content as code permission and still hides charts on dashboards the caller cannot view', async () => {
        const result = await makeService().getComposerChartsForRead(
            account,
            PROJECT_UUID,
            ['visible', 'hidden'],
        );

        expect(result.composerCharts.map(({ slug }) => slug)).toEqual([
            'visible',
        ]);
        expect(result.missingIds).toEqual(['hidden']);
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
