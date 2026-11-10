import { ContentAsCodeType } from '../types/contentAsCode/core';
import assertUnreachable from '../utils/assertUnreachable';
import chartAsCodeSchema from './json/chart-as-code-1.0.json';

// Classic and composer charts share `contentType: chart`; the file's
// `pipeline` tells them apart, so the branch is named by shape.
export const COMPOSER_CHART_BRANCH = 'composer_chart';
export type ChartAsCodeBranch =
    | ContentAsCodeType.CHART
    | ContentAsCodeType.SQL_CHART
    | typeof COMPOSER_CHART_BRANCH;

// One chart shape plus the shared `$defs`, so validation errors skip the
// if/then/else wrapper error the whole-file schema adds.
export const getChartAsCodeBranchSchema = (branch: ChartAsCodeBranch) => {
    const { $schema, $defs } = chartAsCodeSchema;
    switch (branch) {
        case ContentAsCodeType.CHART:
            return { $schema, ...$defs.ChartAsCode, $defs };
        case COMPOSER_CHART_BRANCH:
            return { $schema, ...$defs.ComposerChartAsCode, $defs };
        case ContentAsCodeType.SQL_CHART:
            return { $schema, ...$defs.SqlChartAsCode, $defs };
        default:
            return assertUnreachable(
                branch,
                `Unknown chart as code branch: ${branch}`,
            );
    }
};

export { chartAsCodeSchema };
