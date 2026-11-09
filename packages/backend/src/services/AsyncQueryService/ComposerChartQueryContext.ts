import {
    ForbiddenError,
    metricQueryOfSemanticNode,
    QuerySourceType,
    type Account,
    type ComposerSavedChartDAO,
    type MetricQuery,
    type SavedComposerPipelineNode,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import { comparable } from '../DocumentService/DocumentQueryContext';

const isSemanticNode = (
    node: SavedComposerPipelineNode,
): node is SemanticLayerSourceQuery & { nodeId: string } =>
    node.sourceType === QuerySourceType.SEMANTIC_LAYER;

/** Server-only proof that a semantic-layer query is a node of a composer chart version the account may view. */
export class ComposerChartQueryContext {
    private constructor(
        private readonly accountUserUuid: string,
        readonly projectUuid: string,
        readonly chartUuid: string,
        private readonly nodeMetricQueries: MetricQuery[],
    ) {}

    static fromChart(
        account: Account,
        chart: Pick<ComposerSavedChartDAO, 'uuid' | 'projectUuid' | 'pipeline'>,
    ): ComposerChartQueryContext {
        return new ComposerChartQueryContext(
            account.user.id,
            chart.projectUuid,
            chart.uuid,
            chart.pipeline.nodes
                .filter(isSemanticNode)
                .map(metricQueryOfSemanticNode),
        );
    }

    /** Only a node of the bound version may run, by the account that opened the chart. */
    assertMetricQuery(
        account: Account,
        projectUuid: string,
        query: MetricQuery,
    ): void {
        if (
            account.user.id !== this.accountUserUuid ||
            projectUuid !== this.projectUuid
        ) {
            throw new ForbiddenError(
                'Composer chart query context does not match this execution',
            );
        }
        if (
            !this.nodeMetricQueries.some((node) =>
                isEqual(comparable(node), comparable(query)),
            )
        ) {
            throw new ForbiddenError(
                'Only a node of the composer chart can execute',
            );
        }
    }
}
