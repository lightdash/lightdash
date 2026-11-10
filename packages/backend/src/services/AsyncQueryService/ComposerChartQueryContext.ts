import {
    ForbiddenError,
    metricQueryOfSemanticNode,
    QuerySourceType,
    type Account,
    type ComposerChartNodeRole,
    type ComposerChartQuerySource,
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

/** The run context bound to one semantic node: the metric query that executes must be that node's. */
export class ComposerChartNodeQueryContext {
    constructor(
        private readonly run: ComposerChartQueryContext,
        readonly nodeId: string,
        private readonly metricQuery: MetricQuery,
    ) {}

    get chartUuid(): string {
        return this.run.chartUuid;
    }

    /** Only this node's query may run, by the account that opened the chart. */
    assertMetricQuery(
        account: Account,
        projectUuid: string,
        query: MetricQuery,
    ): ComposerChartQuerySource {
        this.run.assertExecution(account, projectUuid);
        if (!isEqual(comparable(this.metricQuery), comparable(query))) {
            throw new ForbiddenError(
                'Only a node of the composer chart can execute',
            );
        }
        return this.run.nodeSource(this.nodeId);
    }
}

/** Server-only proof that a query is a node of a composer chart version the account may view. */
export class ComposerChartQueryContext {
    private constructor(
        private readonly accountUserUuid: string,
        readonly projectUuid: string,
        readonly chartUuid: string,
        private readonly nodeRoles: Map<string, ComposerChartNodeRole>,
        private readonly semanticNodes: {
            nodeId: string;
            metricQuery: MetricQuery;
        }[],
    ) {}

    /** `chartStageNodeId` names the series-split stage the run appends after the terminal node, when the chart has one. */
    static fromChart(
        account: Account,
        chart: Pick<ComposerSavedChartDAO, 'uuid' | 'projectUuid' | 'pipeline'>,
        chartStageNodeId: string | null,
    ): ComposerChartQueryContext {
        const nodeRoles = new Map<string, ComposerChartNodeRole>(
            chart.pipeline.nodes.map(({ nodeId }) => [
                nodeId,
                nodeId === chart.pipeline.terminalNodeId ? 'terminal' : 'input',
            ]),
        );
        if (chartStageNodeId !== null) {
            nodeRoles.set(chartStageNodeId, 'chartStage');
        }
        return new ComposerChartQueryContext(
            account.user.id,
            chart.projectUuid,
            chart.uuid,
            nodeRoles,
            chart.pipeline.nodes.filter(isSemanticNode).map((node) => ({
                nodeId: node.nodeId,
                metricQuery: metricQueryOfSemanticNode(node),
            })),
        );
    }

    /** The provenance a history row records for a node of the bound version. */
    nodeSource(nodeId: string | undefined): ComposerChartQuerySource {
        const role =
            nodeId === undefined ? undefined : this.nodeRoles.get(nodeId);
        if (nodeId === undefined || role === undefined) {
            throw new ForbiddenError(
                'Only a node of the composer chart can execute',
            );
        }
        return { chartUuid: this.chartUuid, nodeId, role };
    }

    /** Two nodes may share a query, so a semantic row is stamped by the node it ran as, not by query equality. */
    forSemanticNode(nodeId: string | undefined): ComposerChartNodeQueryContext {
        const node =
            nodeId === undefined
                ? undefined
                : this.semanticNodes.find(
                      (candidate) => candidate.nodeId === nodeId,
                  );
        if (!node) {
            throw new ForbiddenError(
                'Only a node of the composer chart can execute',
            );
        }
        return new ComposerChartNodeQueryContext(
            this,
            node.nodeId,
            node.metricQuery,
        );
    }

    assertExecution(account: Account, projectUuid: string): void {
        if (
            account.user.id !== this.accountUserUuid ||
            projectUuid !== this.projectUuid
        ) {
            throw new ForbiddenError(
                'Composer chart query context does not match this execution',
            );
        }
    }
}
