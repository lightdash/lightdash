import { ChartKind, ChartType } from '../../types/savedCharts';
import {
    COMPOSER_TABLE_VIZ,
    isAiComposerChartArtifactConfig,
    isStoredAiComposerChartArtifactConfig,
    sqlArtifactAsComposerConfig,
    upgradeComposerArtifactConfig,
    upgradeLegacyComposerViz,
} from './composerArtifact';

describe('upgradeLegacyComposerViz', () => {
    it('maps a bar with a series split onto the intent, with field ids of the terminal node', () => {
        expect(
            upgradeLegacyComposerViz(
                {
                    type: ChartKind.VERTICAL_BAR,
                    fieldConfig: {
                        x: { reference: 'month' },
                        y: [{ reference: 'revenue' }],
                        groupBy: [{ reference: 'channel' }],
                    },
                },
                'final',
            ),
        ).toEqual({
            intent: expect.objectContaining({
                defaultVizType: 'bar',
                xAxisDimension: 'final_month',
                yAxisMetrics: ['final_revenue'],
                groupBy: ['final_channel'],
            }),
            chartConfig: null,
            pivotConfig: null,
        });
    });

    it('turns a big number into an explorer config, which the agent vocabulary lacks', () => {
        expect(
            upgradeLegacyComposerViz(
                {
                    type: ChartKind.BIG_NUMBER,
                    fieldConfig: { y: [{ reference: 'revenue' }] },
                },
                'final',
            ),
        ).toEqual({
            intent: null,
            chartConfig: {
                type: ChartType.BIG_NUMBER,
                config: { selectedField: 'final_revenue' },
            },
            pivotConfig: null,
        });
    });

    it('reads a table, or nothing, as the table viz', () => {
        expect(upgradeLegacyComposerViz(null, 'final')).toBe(
            COMPOSER_TABLE_VIZ,
        );
        expect(
            upgradeLegacyComposerViz({ type: ChartKind.TABLE }, 'final'),
        ).toBe(COMPOSER_TABLE_VIZ);
    });
});

describe('upgradeComposerArtifactConfig', () => {
    const v1 = {
        source: 'composer' as const,
        schemaVersion: 1 as const,
        queries: [],
        terminalNodeId: 'final',
        vizConfig: {
            type: ChartKind.LINE,
            fieldConfig: { x: { reference: 'day' }, y: [{ reference: 'n' }] },
        },
    };

    it('recognises both stored versions and upgrades the old one', () => {
        expect(isStoredAiComposerChartArtifactConfig(v1)).toBe(true);
        expect(isAiComposerChartArtifactConfig(v1)).toBe(false);
        const upgraded = upgradeComposerArtifactConfig(v1);
        expect(upgraded.schemaVersion).toBe(2);
        expect(isAiComposerChartArtifactConfig(upgraded)).toBe(true);
        expect(upgraded.viz.intent?.defaultVizType).toBe('line');
        expect('vizConfig' in upgraded).toBe(false);
    });

    it('passes a current version through untouched', () => {
        const v2 = upgradeComposerArtifactConfig(v1);
        expect(upgradeComposerArtifactConfig(v2)).toBe(v2);
    });
});

describe('sqlArtifactAsComposerConfig', () => {
    it('reads a SQL artifact as a one-node pipeline opening on a table', () => {
        expect(
            sqlArtifactAsComposerConfig({ sql: 'select 1', limit: 500 }),
        ).toEqual({
            source: 'composer',
            schemaVersion: 2,
            queries: [
                expect.objectContaining({
                    nodeId: 'sql',
                    sql: 'select 1',
                    limit: 500,
                }),
            ],
            terminalNodeId: 'sql',
            viz: COMPOSER_TABLE_VIZ,
        });
    });
});
