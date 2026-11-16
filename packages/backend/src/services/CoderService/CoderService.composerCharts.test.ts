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

describe('CoderService composer chart download', () => {
    it('leaves out a chart whose dashboard the caller cannot view', async () => {
        const assertCanView = vi.fn(
            async (_account: unknown, _project: string, uuid: string) => {
                if (uuid === 'hidden') throw new ForbiddenError();
                return { organizationUuid: ORG_UUID, dashboardUuid: uuid };
            },
        );
        const service = new CoderService({
            lightdashConfig: { contentAsCode: { maxDownloads: 100 } },
            projectModel: {
                getSummary: vi.fn(async () => ({ organizationUuid: ORG_UUID })),
            },
            spaceModel: {
                find: vi.fn(async () => [
                    { uuid: 'space-uuid', path: 'jaffle' },
                ]),
            },
            appModel: { findAppsByUuids: vi.fn(async () => []) },
            composerChartModel: {
                findForCode: vi.fn(
                    async (): Promise<ComposerChart[]> => [
                        storedChart('visible'),
                        storedChart('hidden'),
                    ],
                ),
            },
            composerChartService: { assertCanView },
        } as AnyType);

        const result = await service.getComposerCharts(
            user,
            { user: { userUuid: user.userUuid } } as RegisteredAccount,
            PROJECT_UUID,
            undefined,
            undefined,
        );

        expect(result.composerCharts.map(({ slug }) => slug)).toEqual([
            'visible',
        ]);
        expect(result.total).toBe(1);
    });
});
