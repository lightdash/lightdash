import groupBy from 'lodash/groupBy';
import { getAllReferences } from '../compiler/exploreCompiler';
import type { DbtColumnLightdashDimension } from '../types/dbt';
import {
    convertFieldRefToFieldId,
    type CustomSqlDimension,
    friendlyName,
    getFieldRef,
} from '../types/field';
import type { YamlColumn, YamlModel } from '../types/yamlSchema';

const convertCustomDimensionToDbt = (
    field: CustomSqlDimension,
): DbtColumnLightdashDimension => ({
    label: friendlyName(field.name),
    name: field.id,
    description: '', // TODO :: leave it here so that customer can easily fill in?
    type: field.dimensionType,
    sql: field.sql,
});

function updateModelColumns(
    modelNode: YamlModel,
    customDimensions: CustomSqlDimension[],
): YamlColumn[] {
    /*
      Write in the column of the first dimension referenced in the customDimension.sql
      If there are no dimensions listed/referenced in the SQL, we write back the additional dimension to the first dimension in the model.

      If no models?
      If no columns?
    */

    // better way to do this?
    const firstColumn = convertFieldRefToFieldId(
        getFieldRef({
            table: modelNode.name,
            name: modelNode.columns![0].name,
        }),
    );
    const columnsByRef = customDimensions.reduce<
        Record<string, CustomSqlDimension[]>
    >((acc, dimension) => {
        const refs = getAllReferences(dimension.sql).map((ref) =>
            convertFieldRefToFieldId(ref),
        );
        const targetColumnRef = refs[0] ?? firstColumn;
        const existingDimensions = acc[targetColumnRef] ?? [];
        return {
            ...acc,
            [targetColumnRef]: existingDimensions.concat(dimension),
        };
    }, {});

    return modelNode.columns!.map((column) => {
        const dimensions = columnsByRef[column.name];
        if (dimensions?.length > 0) {
            return {
                ...column,
                meta: {
                    ...column.meta,
                    additional_dimensions: dimensions.reduce<
                        Record<string, DbtColumnLightdashDimension>
                    >((acc, dimension) => {
                        acc[dimension.name] =
                            convertCustomDimensionToDbt(dimension);
                        return acc;
                    }, {}),
                },
            };
        }
        return column;
    });
}

export function insertCustomDimensionsInModelNodes(
    modelNodes: YamlModel[],
    customDimensions: CustomSqlDimension[],
): YamlModel[] {
    const groupDimensionsByTable = groupBy(
        customDimensions,
        (dimension) => dimension.table,
    );

    return modelNodes.map((modelNode) => {
        if (!groupDimensionsByTable[modelNode.name]) {
            return modelNode;
        }

        return {
            ...modelNode,
            columns: updateModelColumns(
                modelNode,
                groupDimensionsByTable[modelNode.name],
            ),
        };
    });
}
