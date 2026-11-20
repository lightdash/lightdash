import {
    getErrorMessage,
    getItemId,
    type ApiExploreResults,
    type DbtModelNode,
    type Explore,
} from '@lightdash/common';
import pLimit from 'p-limit';
import GlobalState from '../../globalState';
import { lightdashApi } from './apiClient';

export const DBT1060_META_HINT =
    'dbt v2 ignores top-level `meta` on models and columns. Move it under `config: meta:`.';

export const isDbt1060MetaError = (message: string): boolean =>
    message.includes('dbt1060') && /unexpected key [`'"]*meta\b/.test(message);

export type FusionEmptyMetaModel = {
    name: string;
    modelMetaEmpty: boolean;
    emptyMetaColumns: string[];
};

export type FusionEmptyMeta = {
    dbtVersion: string;
    models: FusionEmptyMetaModel[];
};

const isEmptyMeta = (
    meta: object | undefined,
    configMeta: object | undefined,
): boolean =>
    Object.keys(meta ?? {}).length === 0 &&
    Object.keys(configMeta ?? {}).length === 0;

export const getFusionEmptyMeta = ({
    dbtVersion,
    skipDbtCompile,
    models,
}: {
    dbtVersion: string | undefined;
    skipDbtCompile: boolean;
    models: Pick<DbtModelNode, 'name' | 'meta' | 'config' | 'columns'>[];
}): FusionEmptyMeta | null => {
    if (!skipDbtCompile || dbtVersion === undefined) return null;
    if (!dbtVersion.startsWith('2.')) return null;
    return {
        dbtVersion,
        models: models
            .map((model) => ({
                name: model.name,
                modelMetaEmpty: isEmptyMeta(model.meta, model.config?.meta),
                emptyMetaColumns: Object.values(model.columns)
                    .filter((column) =>
                        isEmptyMeta(column.meta, column.config?.meta),
                    )
                    .map((column) => column.name),
            }))
            .filter(
                (model) =>
                    model.modelMetaEmpty || model.emptyMetaColumns.length > 0,
            ),
    };
};

type DroppedField = { id: string; column: string | null; untraced: boolean };

const getDroppedFields = (
    previous: Explore,
    next: Explore,
    model: FusionEmptyMetaModel,
): DroppedField[] => {
    const table = previous.tables[previous.baseTable];
    const nextTable = next.tables[next.baseTable];
    if (!table || !nextTable) return [];
    const nextIds = new Set(
        [
            ...Object.values(nextTable.dimensions),
            ...Object.values(nextTable.metrics),
        ].map(getItemId),
    );
    const columnsById = new Map(
        model.emptyMetaColumns.map((name) => [
            getItemId({ table: table.name, name }),
            name,
        ]),
    );
    const dimensions = Object.values(table.dimensions).map((dimension) => ({
        id: getItemId(dimension),
        column:
            columnsById.get(
                getItemId({
                    table: table.name,
                    name:
                        dimension.timeIntervalBaseDimensionName ??
                        dimension.name,
                }),
            ) ?? null,
        // additional dimensions don't record their source column or model
        untraced: dimension.isAdditionalDimension === true,
        modelLevel: false,
    }));
    const metrics = Object.values(table.metrics).map((metric) => ({
        id: getItemId(metric),
        column:
            metric.dimensionReference === undefined
                ? null
                : (columnsById.get(metric.dimensionReference) ?? null),
        untraced: false,
        modelLevel: metric.dimensionReference === undefined,
    }));
    return [...dimensions, ...metrics]
        .filter(
            ({ id, column, untraced, modelLevel }) =>
                !nextIds.has(id) &&
                (column !== null ||
                    (untraced &&
                        (model.modelMetaEmpty ||
                            model.emptyMetaColumns.length > 0)) ||
                    (modelLevel && model.modelMetaEmpty)),
        )
        .map(({ id, column, untraced }) => ({ id, column, untraced }));
};

export const getDroppedFieldIds = (
    previous: Explore,
    next: Explore,
    model: FusionEmptyMetaModel,
): string[] => getDroppedFields(previous, next, model).map(({ id }) => id);

export const getFusionMetaWarning = (
    previous: Explore,
    next: Explore,
    dbtVersion: string,
    model: FusionEmptyMetaModel,
): string | null => {
    const dropped = getDroppedFields(previous, next, model);
    if (dropped.length === 0) return null;
    const columns = [
        ...new Set(
            dropped
                .map(({ column }) => column)
                .filter((column) => column !== null),
        ),
    ];
    const subjects = [
        columns.length > 0
            ? `the ${columns.length === 1 ? 'column' : 'columns'} ${columns.join(', ')}`
            : null,
        dropped.some(({ column, untraced }) => column === null && !untraced)
            ? `the model ${model.name}`
            : null,
    ].filter((subject) => subject !== null);
    const subject =
        subjects.length > 0 ? subjects.join(' and ') : 'their columns or model';
    const verb = subjects.length === 1 && columns.length <= 1 ? 'has' : 'have';
    return `Warning: explore ${next.name} lost ${dropped.length} ${dropped.length === 1 ? 'field' : 'fields'} that the previous deploy had (${dropped.map(({ id }) => id).join(', ')}). This manifest was built by dbt ${dbtVersion}, which ignores top-level meta; ${subject} ${verb} none. Move their meta under config: meta: and recompile.`;
};

export const getFusionMetaWarnings = async (
    projectUuid: string,
    explores: Explore[],
    fusionEmptyMeta: FusionEmptyMeta,
): Promise<string[]> => {
    const limit = pLimit(8);
    const warnings = await Promise.all(
        explores.map((explore) => {
            const model = fusionEmptyMeta.models.find(
                ({ name }) => name === explore.baseTable,
            );
            if (!model) return null;
            return limit(async () => {
                try {
                    const previous = await lightdashApi<ApiExploreResults>({
                        method: 'GET',
                        url: `/api/v1/projects/${projectUuid}/explores/${encodeURIComponent(explore.name)}`,
                        body: undefined,
                    });
                    return getFusionMetaWarning(
                        previous,
                        explore,
                        fusionEmptyMeta.dbtVersion,
                        model,
                    );
                } catch (e) {
                    GlobalState.debug(
                        `> Skipping meta comparison for explore ${explore.name}: ${getErrorMessage(e)}`,
                    );
                    return null;
                }
            });
        }),
    );
    return warnings.filter((warning) => warning !== null);
};
