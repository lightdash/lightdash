import { ContentAsCodeType } from '../types/contentAsCode/core';
import assertUnreachable from '../utils/assertUnreachable';
import chartAsCodeSchema from './json/chart-as-code-1.0.json';

export type ChartAsCodeContentType =
    | ContentAsCodeType.CHART
    | ContentAsCodeType.SQL_CHART;

// One chart shape plus the shared `$defs`, so validation errors skip the
// if/then/else wrapper error the whole-file schema adds.
export const getChartAsCodeBranchSchema = (
    contentType: ChartAsCodeContentType,
) => {
    const { $schema, $defs } = chartAsCodeSchema;
    switch (contentType) {
        case ContentAsCodeType.CHART:
            return { $schema, ...$defs.ChartAsCode, $defs };
        case ContentAsCodeType.SQL_CHART:
            return { $schema, ...$defs.SqlChartAsCode, $defs };
        default:
            return assertUnreachable(
                contentType,
                `Unknown chart as code content type: ${contentType}`,
            );
    }
};

export { chartAsCodeSchema };
