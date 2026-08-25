import {
    getEffectiveOptionValues,
    type DataAppVizContext,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type ItemsMap,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
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
};

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
}: Args): DataAppVizContext => ({
    fieldMapping: persistedFieldMapping
        ? reconcileDataAppVizFieldMapping(
              schema.fields,
              itemsMap,
              persistedFieldMapping,
          )
        : autoMapDataAppVizFields(schema.fields, itemsMap),
    rows,
    options: getEffectiveOptionValues(schema.configOptions, optionValues),
    colorPalette,
    pivotDetails,
    underlyingData: { enabled: false },
    drillDown: { enabled: false },
});
