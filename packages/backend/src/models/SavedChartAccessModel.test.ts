import {
    NotFoundError,
    ParameterError,
    SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { SavedChartAccessModel } from './SavedChartAccessModel';

// Minimal chainable stub for the single getMutationContext query: every
// builder method returns the same object; `.first()` resolves the chart row.
const makeTrx = (chartRow: unknown) => {
    const builder: Record<string, unknown> = {};
    for (const method of [
        'innerJoin',
        'where',
        'whereNull',
        'select',
        'forUpdate',
    ]) {
        builder[method] = () => builder;
    }
    builder.first = async () => chartRow;
    return () => builder;
};

const database = (chartRow: unknown) =>
    ({
        transaction: async (callback: (trx: Knex) => Promise<unknown>) =>
            callback(makeTrx(chartRow) as unknown as Knex),
    }) as unknown as Knex;

const grantArgs = {
    resourceUuid: 'chart-uuid',
    userUuid: 'user-uuid',
    role: SpaceMemberRole.EDITOR,
    organizationUuid: 'org-uuid',
    grantedByUserUuid: 'granter-uuid',
};

describe('SavedChartAccessModel grant guard', () => {
    // SPK-1450: dashboard-owned charts (dashboard_uuid set / space_id null)
    // inherit access through their dashboard and must never take a direct
    // chart grant — the tripwire that keeps one chart from carrying two
    // GrantSource kinds.
    it('refuses a grant on a dashboard-owned chart', async () => {
        const model = new SavedChartAccessModel(
            database({
                spaceId: null,
                dashboardUuid: 'owning-dashboard-uuid',
                organizationId: 1,
                organizationUuid: 'org-uuid',
                projectId: 1,
                projectUuid: 'project-uuid',
            }),
        );
        await expect(model.upsertUserAccess(grantArgs)).rejects.toThrow(
            ParameterError,
        );
    });

    it('refuses a group grant on a dashboard-owned chart', async () => {
        const model = new SavedChartAccessModel(
            database({
                spaceId: null,
                dashboardUuid: 'owning-dashboard-uuid',
                organizationId: 1,
                organizationUuid: 'org-uuid',
                projectId: 1,
                projectUuid: 'project-uuid',
            }),
        );
        await expect(
            model.upsertGroupAccess({
                resourceUuid: 'chart-uuid',
                groupUuid: 'group-uuid',
                role: SpaceMemberRole.EDITOR,
                organizationUuid: 'org-uuid',
                grantedByUserUuid: 'granter-uuid',
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('fails closed on an unknown or cross-organization chart', async () => {
        const model = new SavedChartAccessModel(database(undefined));
        await expect(model.upsertUserAccess(grantArgs)).rejects.toThrow(
            NotFoundError,
        );
    });

    it('refuses a reset on a dashboard-owned chart', async () => {
        const model = new SavedChartAccessModel(
            database({
                spaceId: null,
                dashboardUuid: 'owning-dashboard-uuid',
                organizationId: 1,
                organizationUuid: 'org-uuid',
                projectId: 1,
                projectUuid: 'project-uuid',
            }),
        );
        await expect(
            model.resetAccess({
                resourceUuid: 'chart-uuid',
                organizationUuid: 'org-uuid',
            }),
        ).rejects.toThrow(ParameterError);
    });
});
