import type { PivotData, ResultRow } from '@lightdash/common';
import type { Row } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import {
    getMetricsAsRowsMetricIds,
    projectMetricsAsRowsSubtotalRenderRows,
} from './getMetricsAsRowsSubtotalRenderRows';

const createRow = ({
    id,
    index,
    grouped = false,
    subRows = [],
}: {
    id: string;
    index: number;
    grouped?: boolean;
    subRows?: Row<ResultRow>[];
}): Row<ResultRow> =>
    ({
        id,
        index,
        subRows,
        getIsGrouped: () => grouped,
    }) as Row<ResultRow>;

describe('metrics-as-rows subtotal projection', () => {
    it('projects grouped rows by visible metric while preserving row order and core indexes', () => {
        const indexValues = [
            [{ type: 'label', fieldId: 'metric_b' }],
            [{ type: 'label', fieldId: 'metric_a' }],
            [{ type: 'label', fieldId: 'metric_b' }],
        ] satisfies PivotData['indexValues'];
        const metricFieldIds = getMetricsAsRowsMetricIds(indexValues);
        const leaves = [11, 12, 14, 15].map((index) =>
            createRow({ id: `leaf-${index}`, index }),
        );
        const nestedGroup = createRow({
            id: 'nested-group',
            index: 2,
            grouped: true,
            subRows: leaves,
        });
        const outerGroup = createRow({
            id: 'outer-group',
            index: 1,
            grouped: true,
            subRows: [nestedGroup],
        });
        const rows = [outerGroup, nestedGroup, ...leaves];

        expect(metricFieldIds).toEqual(['metric_b', 'metric_a']);
        expect(
            projectMetricsAsRowsSubtotalRenderRows({
                rows,
                metricFieldIds,
                enabled: true,
            }).map((renderRow) =>
                renderRow.kind === 'metricSubtotal'
                    ? `${renderRow.row.id}:${renderRow.metricFieldId}:${renderRow.sourceRowCount}`
                    : `${renderRow.row.id}:${renderRow.dataRowIndex}`,
            ),
        ).toEqual([
            'outer-group:metric_b:2',
            'outer-group:metric_a:2',
            'nested-group:metric_b:2',
            'nested-group:metric_a:2',
            'leaf-11:11',
            'leaf-12:12',
            'leaf-14:14',
            'leaf-15:15',
        ]);
        expect(
            projectMetricsAsRowsSubtotalRenderRows({
                rows,
                metricFieldIds,
                enabled: false,
            }).map((renderRow) =>
                renderRow.kind === 'standard'
                    ? `${renderRow.row.id}:${renderRow.dataRowIndex}`
                    : `${renderRow.row.id}:${renderRow.metricFieldId}`,
            ),
        ).toEqual([
            'outer-group:null',
            'nested-group:null',
            'leaf-11:11',
            'leaf-12:12',
            'leaf-14:14',
            'leaf-15:15',
        ]);
    });
});
