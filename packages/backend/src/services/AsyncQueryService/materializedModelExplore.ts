import {
    compileLightdashModels,
    DEFAULT_SPOTLIGHT_CONFIG,
    isExploreError,
    ParameterError,
    parseModelDocument,
    WarehouseTypes,
    type Explore,
    type WarehouseSqlBuilder,
    type WeekDay,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { getMaterializedFieldError } from '../ModelMaterializationService/materializedFieldError';

export const MATERIALIZED_MODEL_RELATION = '__lightdash_materialized_model';

const visibleFields = <T>(
    compiled: Record<string, T>,
    visible: Record<string, T>,
): Record<string, T> =>
    Object.fromEntries(
        Object.keys(visible).map((name) => {
            if (!Object.hasOwn(compiled, name))
                throw new ParameterError(
                    `Field ${name} cannot be compiled for this materialization.`,
                );
            return [name, compiled[name]];
        }),
    );

export const compileMaterializedModelExplore = async ({
    content,
    explore,
    startOfWeek,
}: {
    content: string;
    explore: Explore;
    startOfWeek: WeekDay | null;
}): Promise<{ explore: Explore; warehouseSqlBuilder: WarehouseSqlBuilder }> => {
    const model = parseModelDocument(
        content,
        explore.ymlPath ?? `models/${explore.baseTable}.yml`,
    );
    if (
        !model.materialize ||
        explore.joinedTables.length ||
        Object.keys(explore.tables).length !== 1
    )
        throw new ParameterError(
            `Explore ${explore.name} cannot be served by this materialized model.`,
        );
    const error = getMaterializedFieldError(model);
    if (error) throw new ParameterError(error);
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        WarehouseTypes.DUCKDB,
        startOfWeek,
    );
    const variants = await compileLightdashModels({
        models: [{ ...model, sql_from: MATERIALIZED_MODEL_RELATION }],
        warehouseSqlBuilder,
        lightdashProjectConfig: { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
    });
    const variant = variants.find(({ name }) => name === explore.name);
    if (
        !variant ||
        isExploreError(variant) ||
        variant.baseTable !== explore.baseTable ||
        variant.warnings?.length
    )
        throw new ParameterError(
            `Explore ${explore.name} could not be compiled for its materialization.`,
        );
    const base = variant.tables[variant.baseTable];
    const visible = explore.tables[explore.baseTable];
    if (!base || !visible || variant.joinedTables.length)
        throw new ParameterError(
            `Explore ${explore.name} requires unsupported materialized joins.`,
        );
    return {
        warehouseSqlBuilder,
        explore: {
            ...variant,
            tables: {
                [variant.baseTable]: {
                    ...base,
                    dimensions: visibleFields(
                        base.dimensions,
                        visible.dimensions,
                    ),
                    metrics: visibleFields(base.metrics, visible.metrics),
                },
            },
        },
    };
};
