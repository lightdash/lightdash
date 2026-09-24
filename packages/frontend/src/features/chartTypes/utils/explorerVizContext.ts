import {
    deriveDataAppVizFieldMetadata,
    getDataAppVizFieldOptions,
    getEffectiveOptionValues,
    type DataAppVizContext,
    type DataAppVizFieldMapping,
    type DataAppVizFieldOptionValues,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type ItemsMap,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { type DataAppVizResolvedColors } from '../hooks/useDataAppVizResolvedColors';
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from './autoMapDataAppVizFields';

type Args = {
    schema: DataAppVizSchema;
    itemsMap: ItemsMap;
    /** The chart's saved binding when it already uses this type; null binds
     *  the schema's slots to the result columns afresh. */
    persistedFieldMapping: DataAppVizFieldMapping | null;
    rows: ResultRow[];
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    colorPalette: string[];
    optionValues: DataAppVizOptionValues;
    fieldOptionValues: DataAppVizFieldOptionValues;
    resolvedColors: DataAppVizResolvedColors;
};

export const resolveExplorerVizFieldMapping = ({
    schema,
    itemsMap,
    persistedFieldMapping,
}: Pick<
    Args,
    'schema' | 'itemsMap' | 'persistedFieldMapping'
>): DataAppVizFieldMapping =>
    persistedFieldMapping
        ? reconcileDataAppVizFieldMapping(
              schema.fields,
              itemsMap,
              persistedFieldMapping,
          )
        : autoMapDataAppVizFields(schema.fields, itemsMap);

/** A `DataAppVizContext` for previewing a chart type against the Explorer's
 *  own results while it is authored. Not a chart, so nothing to drill into. */
export const buildExplorerVizContext = ({
    schema,
    itemsMap,
    persistedFieldMapping,
    rows,
    pivotDetails,
    colorPalette,
    optionValues,
    fieldOptionValues,
    resolvedColors,
}: Args): DataAppVizContext => {
    const fieldMapping = resolveExplorerVizFieldMapping({
        schema,
        itemsMap,
        persistedFieldMapping,
    });
    return {
        fieldMapping,
        fields: deriveDataAppVizFieldMetadata(fieldMapping, itemsMap),
        rows,
        options: getEffectiveOptionValues(schema.configOptions, optionValues),
        fieldOptions: getDataAppVizFieldOptions(
            schema.fields,
            fieldMapping,
            fieldOptionValues,
        ),
        colorPalette,
        ...resolvedColors,
        pivotDetails,
        underlyingData: { enabled: false },
        drillDown: { enabled: false },
        pointMenu: { enabled: false },
    };
};
