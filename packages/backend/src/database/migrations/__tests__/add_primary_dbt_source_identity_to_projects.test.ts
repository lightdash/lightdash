import { getAvailablePrimaryDbtSourceName } from '../20260816190000_add_primary_dbt_source_identity_to_projects';

describe('primary dbt source identity migration', () => {
    it('backfills a distinct primary identity when an additional source already uses dbt_project', () => {
        const sourceName = getAvailablePrimaryDbtSourceName(
            new Set(['dbt_project', 'dbt_project_1']),
        );

        expect(sourceName).toBe('dbt_project_2');
        expect(['dbt_project_2__orders', 'dbt_project__orders']).toEqual([
            `${sourceName}__orders`,
            'dbt_project__orders',
        ]);
    });
});
