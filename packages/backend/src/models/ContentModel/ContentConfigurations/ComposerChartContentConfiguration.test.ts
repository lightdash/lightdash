import { ChartKind, ChartType, ContentType } from '@lightdash/common';
import knex from 'knex';
import { type SummaryContentRow } from '../ContentModelTypes';
import { composerChartContentConfiguration } from './ComposerChartContentConfiguration';
import { spaceContentConfiguration } from './SpaceContentConfiguration';

const database = knex({ client: 'pg' });
const listed = {
    composerCharts: true,
    contentTypes: [ContentType.CHART, ContentType.COMPOSER_CHART],
};

describe('Composer chart content', () => {
    it('is listed only when asked for by type with the flag on, and never in Recently deleted', () => {
        const included =
            composerChartContentConfiguration.shouldQueryBeIncluded;
        expect(included(listed)).toBe(true);
        expect(included({ ...listed, composerCharts: false })).toBe(false);
        expect(included({ composerCharts: true })).toBe(false);
        expect(
            included({
                composerCharts: true,
                contentTypes: [ContentType.CHART],
            }),
        ).toBe(false);
        expect(included({ ...listed, deleted: true })).toBe(false);
        expect(included({ ...listed, sharedWithMe: true })).toBe(false);
        expect(included({ ...listed, ownerUserUuids: ['owner'] })).toBe(false);
    });

    it('lists live space-owned charts in live spaces, with the latest version', () => {
        const query = composerChartContentConfiguration
            .getSummaryQuery(database, {
                ...listed,
                projectUuids: ['project'],
                spaceUuids: ['space'],
                search: 'revenue',
            })
            .toSQL();
        expect(query.sql).toContain(
            '"composer_charts"."dashboard_uuid" is null',
        );
        expect(query.sql).toContain('"composer_charts"."deleted_at" is null');
        expect(query.sql).toContain('"spaces"."deleted_at" is null');
        expect(query.sql).toContain('"spaces"."space_uuid" in (?)');
        expect(query.sql).toContain('ORDER BY created_at DESC');
        expect(query.sql).not.toMatch(/pipeline/);
        expect(query.bindings).toEqual(
            expect.arrayContaining(['project', 'space', '%revenue%']),
        );
    });

    it('takes the chart kind from the latest chart config, defaulting to bar', () => {
        const convert = (chartConfig: unknown) =>
            composerChartContentConfiguration.convertSummaryRow({
                content_type: ContentType.COMPOSER_CHART,
                metadata: { chart_config: chartConfig },
            } as unknown as SummaryContentRow);
        expect(convert({ type: ChartType.PIE, config: {} })).toMatchObject({
            contentType: ContentType.COMPOSER_CHART,
            chartKind: ChartKind.PIE,
            views: 0,
            verification: null,
        });
        expect(convert(null)).toMatchObject({
            chartKind: ChartKind.VERTICAL_BAR,
        });
    });

    it('counts them in direct and descendant space counts only with the flag on', () => {
        const sql = (
            filters: Parameters<
                typeof spaceContentConfiguration.getSummaryQuery
            >[1],
        ) =>
            spaceContentConfiguration.getSummaryQuery(database, filters).toSQL()
                .sql;
        expect(sql({ composerCharts: true })).toContain(
            'FROM composer_charts cc',
        );
        expect(
            sql({ composerCharts: true, includeDescendantCounts: true }),
        ).toContain('FROM composer_charts cc');
        expect(sql({ composerCharts: false })).not.toContain('composer_charts');
        expect(
            sql({ composerCharts: false, includeDescendantCounts: true }),
        ).not.toContain('composer_charts');
    });
});
