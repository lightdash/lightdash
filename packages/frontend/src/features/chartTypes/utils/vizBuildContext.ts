import {
    MAX_APP_VIZ_BUILD_SAMPLE_ROWS,
    MAX_APP_VIZ_BUILD_SAMPLE_FIELDS,
    MAX_APP_VIZ_BUILD_SAMPLE_CELL_CHARS,
    MAX_APP_VIZ_BUILD_ELEMENT_REFS,
    type AppVizBuildContext,
} from '@lightdash/common';

export const normalizeVizBuildContext = (
    context: AppVizBuildContext | undefined,
    includeSampleData: boolean,
): AppVizBuildContext | undefined => {
    if (!context) return undefined;
    const normalized: AppVizBuildContext = {
        ...(context.schema ? { schema: context.schema } : {}),
        ...(context.fieldMapping ? { fieldMapping: context.fieldMapping } : {}),
        ...(context.elementReferences?.length
            ? {
                  elementReferences: context.elementReferences.slice(
                      0,
                      MAX_APP_VIZ_BUILD_ELEMENT_REFS,
                  ),
              }
            : {}),
        ...(includeSampleData && context.sampleRows?.length
            ? {
                  sampleRows: context.sampleRows
                      .slice(0, MAX_APP_VIZ_BUILD_SAMPLE_ROWS)
                      .map((row) =>
                          Object.fromEntries(
                              Object.entries(row)
                                  .slice(0, MAX_APP_VIZ_BUILD_SAMPLE_FIELDS)
                                  .map(([field, value]) => [
                                      field,
                                      value.slice(
                                          0,
                                          MAX_APP_VIZ_BUILD_SAMPLE_CELL_CHARS,
                                      ),
                                  ]),
                          ),
                      ),
              }
            : {}),
    };
    return Object.keys(normalized).length > 0 ? normalized : undefined;
};
