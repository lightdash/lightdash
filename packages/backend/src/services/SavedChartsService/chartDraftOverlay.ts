import {
    isJwtUser,
    normalizeSavedMergeDefinition,
    ParameterError,
    type Account,
    type SavedChartDAO,
    type SavedMergeDefinition,
    type SavedMergeQuery,
} from '@lightdash/common';
import type Logger from '../../logging/logger';
import type { ContentDraftModel } from '../../models/ContentDraftModel';

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
        | 'spaceUuid'
    >
> & {
    merge?: SavedMergeDefinition | SavedMergeQuery | null;
    verified?: boolean;
};

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

export const mergeDraftIntoChart = <
    T extends Pick<SavedChartDAO, 'metricQuery'>,
>(
    chart: T,
    draft: unknown,
): T => {
    assertChartDraftOverlay(draft);
    const merge = draft.merge
        ? normalizeSavedMergeDefinition(
              draft.merge,
              draft.metricQuery ?? chart.metricQuery,
          )
        : draft.merge;
    if (draft.merge && !merge) {
        throw new ParameterError('Invalid saved merge definition.');
    }
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
        ...(merge !== undefined && { merge }),
        ...(draft.spaceUuid !== undefined && {
            spaceUuid: draft.spaceUuid,
        }),
    };
};

/** Query execution and boundary metadata must use the same author-owned draft. */
export const applyOpenChartDraft = async <
    T extends Pick<SavedChartDAO, 'uuid' | 'metricQuery'>,
>({
    account,
    projectUuid,
    chart,
    contentDraftModel,
    logger,
}: {
    account: Account;
    projectUuid: string;
    chart: T;
    contentDraftModel: Pick<ContentDraftModel, 'findOpenDraft'>;
    logger: Pick<typeof Logger, 'warn'>;
}): Promise<T> => {
    if (isJwtUser(account)) return chart;
    const draft = await contentDraftModel.findOpenDraft(
        projectUuid,
        'chart',
        chart.uuid,
        account.user.userUuid,
    );
    if (!draft) return chart;
    try {
        return mergeDraftIntoChart(chart, draft.draft);
    } catch (error) {
        logger.warn(
            `Ignoring invalid chart draft ${draft.uuid} while resolving chart query`,
            error,
        );
        return chart;
    }
};
