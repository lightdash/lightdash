import { ChartKind, ChartType, ContentType } from '@lightdash/common';
import { type SummaryContentRow } from '../ContentModelTypes';
import { composerChartContentConfiguration } from './ComposerChartContentConfiguration';

const listed = {
    composerCharts: { allowedSpaceUuids: ['space'] },
    contentTypes: [ContentType.CHART, ContentType.COMPOSER_CHART],
};

describe('Composer chart content', () => {
    it('is listed only when asked for by type with the flag on, and never in Recently deleted', () => {
        const included =
            composerChartContentConfiguration.shouldQueryBeIncluded;
        expect(included(listed)).toBe(true);
        expect(included({ ...listed, composerCharts: undefined })).toBe(false);
        expect(included({ composerCharts: listed.composerCharts })).toBe(false);
        expect(
            included({
                composerCharts: listed.composerCharts,
                contentTypes: [ContentType.CHART],
            }),
        ).toBe(false);
        expect(included({ ...listed, deleted: true })).toBe(false);
        expect(included({ ...listed, sharedWithMe: true })).toBe(false);
        expect(included({ ...listed, ownerUserUuids: ['owner'] })).toBe(false);
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
        expect(
            convert({
                type: ChartType.CARTESIAN,
                config: {
                    layout: {},
                    eChartsConfig: { series: [{ type: 'unknown' }] },
                },
            }),
        ).toMatchObject({ chartKind: ChartKind.VERTICAL_BAR });
    });
});
