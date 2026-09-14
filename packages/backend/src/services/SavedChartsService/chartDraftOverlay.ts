import type { SavedChartDAO } from '@lightdash/common';

export type ChartDraftOverlay = Partial<
    Pick<
        SavedChartDAO,
        | 'name'
        | 'description'
        | 'tableName'
        | 'metricQuery'
        | 'chartConfig'
        | 'tableConfig'
        | 'pivotConfig'
        | 'parameters'
        | 'merge'
        | 'spaceUuid'
    >
> & { verified?: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const assertChartDraftOverlay: (
    draft: unknown,
) => asserts draft is ChartDraftOverlay = (draft) => {
    if (!isRecord(draft)) throw new Error('Chart draft must be an object');
    const validators: Record<
        keyof ChartDraftOverlay,
        (value: unknown) => boolean
    > = {
        name: (value) => typeof value === 'string',
        description: (value) => typeof value === 'string',
        tableName: (value) => typeof value === 'string',
        metricQuery: isRecord,
        chartConfig: isRecord,
        tableConfig: isRecord,
        pivotConfig: isRecord,
        parameters: isRecord,
        merge: (value) => value === null || isRecord(value),
        spaceUuid: (value) => typeof value === 'string',
        verified: (value) => typeof value === 'boolean',
    };
    for (const [field, validate] of Object.entries(validators)) {
        if (
            Object.prototype.hasOwnProperty.call(draft, field) &&
            draft[field] !== undefined &&
            !validate(draft[field])
        ) {
            throw new Error(`Invalid chart draft field: ${field}`);
        }
    }
};

export const mergeDraftIntoChart = <T extends SavedChartDAO>(
    chart: T,
    draft: unknown,
): T => {
    assertChartDraftOverlay(draft);
    return {
        ...chart,
        ...(draft.name !== undefined && { name: draft.name }),
        ...(draft.description !== undefined && {
            description: draft.description,
        }),
        ...(draft.tableName !== undefined && {
            tableName: draft.tableName,
        }),
        ...(draft.metricQuery !== undefined && {
            metricQuery: draft.metricQuery,
        }),
        ...(draft.chartConfig !== undefined && {
            chartConfig: draft.chartConfig,
        }),
        ...(draft.tableConfig !== undefined && {
            tableConfig: draft.tableConfig,
        }),
        ...(draft.pivotConfig !== undefined && {
            pivotConfig: draft.pivotConfig,
        }),
        ...(draft.parameters !== undefined && {
            parameters: draft.parameters,
        }),
        ...(draft.merge !== undefined && { merge: draft.merge }),
        ...(draft.spaceUuid !== undefined && {
            spaceUuid: draft.spaceUuid,
        }),
    };
};
