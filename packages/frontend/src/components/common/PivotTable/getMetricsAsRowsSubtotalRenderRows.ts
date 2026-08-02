import type { PivotData, ResultRow } from '@lightdash/common';
import type { Row } from '@tanstack/react-table';
import { countSubRows } from '../Table/utils';

export type MetricsAsRowsSubtotalRenderRow =
    | {
          kind: 'standard';
          row: Row<ResultRow>;
          dataRowIndex: number | null;
      }
    | {
          kind: 'metricSubtotal';
          row: Row<ResultRow>;
          metricFieldId: string;
          metricIndex: number;
          metricCount: number;
          sourceRowCount: number;
      };

export const getMetricsAsRowsMetricIds = (
    indexValues: PivotData['indexValues'],
): string[] => {
    const seenMetricFieldIds = new Set<string>();
    const metricFieldIds: string[] = [];

    for (const indexValueRow of indexValues) {
        for (const indexValue of indexValueRow) {
            if (
                indexValue.type === 'label' &&
                !seenMetricFieldIds.has(indexValue.fieldId)
            ) {
                seenMetricFieldIds.add(indexValue.fieldId);
                metricFieldIds.push(indexValue.fieldId);
            }
        }
    }

    return metricFieldIds;
};

export const projectMetricsAsRowsSubtotalRenderRows = ({
    rows,
    metricFieldIds,
    enabled,
}: {
    rows: Row<ResultRow>[];
    metricFieldIds: string[];
    enabled: boolean;
}): MetricsAsRowsSubtotalRenderRow[] => {
    const metricCount = metricFieldIds.length;

    return rows.flatMap<MetricsAsRowsSubtotalRenderRow>((row) => {
        const isGrouped = row.getIsGrouped();

        if (!enabled || !isGrouped) {
            return {
                kind: 'standard',
                row,
                dataRowIndex: isGrouped ? null : row.index,
            };
        }

        if (metricCount === 0) return [];

        const sourceRowCount = countSubRows(row) / metricCount;

        return metricFieldIds.map((metricFieldId, metricIndex) => ({
            kind: 'metricSubtotal',
            row,
            metricFieldId,
            metricIndex,
            metricCount,
            sourceRowCount,
        }));
    });
};
