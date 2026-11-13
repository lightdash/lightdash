import {
    ForbiddenError,
    getComposerChartPivotStage,
    type Account,
    type ComposerChart,
    type ComposerChartPipelineNode,
    type ComposerChartRunSource,
    type ParametersValuesMap,
    type RegisteredAccount,
} from '@lightdash/common';

/** Server-only proof a bound run executes a stored chart for an authorized viewer; only ComposerChartService builds one. */
export class ComposerRunBinding {
    private constructor(
        private readonly userUuid: string,
        readonly projectUuid: string,
        readonly nodes: ComposerChartPipelineNode[],
        /** The dashboard's values for the shared map SQL, DuckDB and Python nodes read. */
        readonly parameters: ParametersValuesMap,
        readonly stamp: ComposerChartRunSource,
        /** The server-built series-split stage, run after the terminal node; null without a group-by. */
        readonly chartStageNodeId: string | null,
    ) {}

    static forAuthorizedViewer({
        account,
        chart,
        tileUuid,
        resolved,
    }: {
        account: RegisteredAccount;
        chart: ComposerChart;
        tileUuid: string;
        /** The stored nodes with the dashboard's filters and parameters written on, and the shared parameter map. */
        resolved: {
            nodes: ComposerChartPipelineNode[];
            parameters: ParametersValuesMap;
        };
    }): ComposerRunBinding {
        const stage = getComposerChartPivotStage(chart.pipeline, chart.chart);
        return new ComposerRunBinding(
            account.user.userUuid,
            chart.projectUuid,
            stage ? [...resolved.nodes, stage] : resolved.nodes,
            resolved.parameters,
            {
                composerChartUuid: chart.uuid,
                dashboardUuid: chart.dashboardUuid,
                tileUuid,
            },
            stage?.nodeId ?? null,
        );
    }

    /** Refuses a binding carried into another account's or project's execution. */
    assertExecution(account: Account, projectUuid: string): void {
        if (
            account.user.id !== this.userUuid ||
            projectUuid !== this.projectUuid
        ) {
            throw new ForbiddenError(
                'Composer run binding does not match this execution',
            );
        }
    }
}
