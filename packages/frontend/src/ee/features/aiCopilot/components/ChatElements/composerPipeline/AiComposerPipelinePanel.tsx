import {
    assertUnreachable,
    formatSql,
    friendlyName,
    QuerySourceType,
    WarehouseTypes,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import { Box, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import {
    IconChevronRight,
    IconDatabase,
    IconFileSpreadsheet,
    IconHelpCircle,
    IconSitemap,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import CodeBlock from '../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../../../components/common/ResizableSplitter';
import { LD_FIELD_COLORS } from '../../../../../../theme/fieldColors';
import styles from './AiComposerPipelinePanel.module.css';
import {
    groupPipeline,
    type PipelineLayer,
    type PipelineNode,
} from './groupPipeline';

const TRANSFORMATIONS_HELP =
    'Transformations run in DuckDB on top of the source results. They never touch the warehouse.';

const pipelineNodeRowId = (nodeId: string) =>
    `composer-pipeline-node-${nodeId}`;

const layerLabel = (layer: PipelineLayer) => {
    const single = layer.nodes.length === 1;
    switch (layer.kind) {
        case 'sources':
            return single ? 'Source' : 'Sources';
        case 'transformations':
            return single ? 'Transformation' : 'Transformations';
        case 'result':
            return 'Result';
        default:
            return assertUnreachable(layer.kind, 'Unknown pipeline layer');
    }
};

const sourceLabel = (query: SourceQuery) => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return { label: 'Semantic layer', icon: IconSitemap };
        case QuerySourceType.SQL:
            return { label: 'Warehouse SQL', icon: IconDatabase };
        case QuerySourceType.EXTERNAL:
            return { label: 'External data', icon: IconFileSpreadsheet };
        case QuerySourceType.DUCKDB:
            return null;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

const formattedSqlOf = (query: SourceQuery) => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return null;
        case QuerySourceType.SQL:
            return formatSql(query.sql);
        case QuerySourceType.DUCKDB:
        case QuerySourceType.EXTERNAL:
            return formatSql(query.sql, WarehouseTypes.DUCKDB);
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

const SemanticFields: FC<{ query: SemanticLayerSourceQuery }> = ({ query }) => {
    const fieldLabel = (fieldId: string) =>
        friendlyName(fieldId.replace(`${query.exploreName}_`, ''));
    return (
        <Group gap={4} className={styles.fields}>
            <Text component="span" className={styles.exploreName}>
                {friendlyName(query.exploreName)}
            </Text>
            {query.dimensions.map((fieldId) => (
                <Box
                    key={fieldId}
                    component="span"
                    className={styles.fieldChip}
                    bg={LD_FIELD_COLORS.dimension.bg}
                    c={LD_FIELD_COLORS.dimension.color}
                >
                    {fieldLabel(fieldId)}
                </Box>
            ))}
            {query.metrics.map((fieldId) => (
                <Box
                    key={fieldId}
                    component="span"
                    className={styles.fieldChip}
                    bg={LD_FIELD_COLORS.metric.bg}
                    c={LD_FIELD_COLORS.metric.color}
                >
                    {fieldLabel(fieldId)}
                </Box>
            ))}
        </Group>
    );
};

const PipelineNodeRow: FC<{ node: PipelineNode }> = ({ node }) => {
    const source = sourceLabel(node.query);
    const sql = useMemo(() => formattedSqlOf(node.query), [node.query]);
    return (
        <Box
            className={styles.node}
            id={pipelineNodeRowId(node.nodeId)}
            data-node-id={node.nodeId}
        >
            <Box className={styles.nodeHead}>
                <Box className={styles.dot} data-status="success" />
                <Text component="span" className={styles.nodeTitle}>
                    {node.title}
                    {node.isTerminal ? ' · result' : ''}
                </Text>
                {source && (
                    <Text component="span" className={styles.nodeType}>
                        <MantineIcon icon={source.icon} size={11} />
                        {source.label}
                    </Text>
                )}
            </Box>
            {node.description && (
                <Text className={styles.nodeDescription}>
                    {node.description}
                </Text>
            )}
            {node.reads.length > 0 && (
                <Text className={styles.nodeReads}>
                    Reads {node.reads.join(', ')}
                </Text>
            )}
            {node.query.sourceType === QuerySourceType.SEMANTIC_LAYER && (
                <SemanticFields query={node.query} />
            )}
            {sql && (
                <Box className={styles.code}>
                    <CodeBlock code={sql} language="sql" />
                </Box>
            )}
        </Box>
    );
};

const PipelineList: FC<{ layers: PipelineLayer[] }> = ({ layers }) => (
    <Box className={styles.body}>
        {layers.map((layer) => (
            <Box key={layer.depth} className={styles.layer}>
                <Group gap={4} className={styles.layerHeading}>
                    <Text component="span" inherit>
                        {layerLabel(layer)}
                    </Text>
                    {layer.kind === 'transformations' && (
                        <Tooltip
                            label={TRANSFORMATIONS_HELP}
                            multiline
                            w={260}
                            position="top-start"
                        >
                            <Box
                                className={styles.helpIcon}
                                aria-label="About transformations"
                            >
                                <MantineIcon icon={IconHelpCircle} size={12} />
                            </Box>
                        </Tooltip>
                    )}
                </Group>
                {layer.nodes.map((node) => (
                    <PipelineNodeRow key={node.nodeId} node={node} />
                ))}
            </Box>
        ))}
    </Box>
);

const PipelineBar: FC<{
    stepCount: number;
    expanded: boolean;
    onToggle: () => void;
}> = ({ stepCount, expanded, onToggle }) => (
    <Box className={styles.bar}>
        <UnstyledButton
            className={styles.barToggle}
            onClick={onToggle}
            aria-expanded={expanded}
        >
            <MantineIcon
                icon={IconChevronRight}
                size={11}
                stroke={1.6}
                className={clsx(styles.chevron, expanded && styles.chevronOpen)}
            />
            <Text component="span" className={styles.heading}>
                Queries
            </Text>
        </UnstyledButton>
        <Text component="span" className={styles.meta}>
            {stepCount} step{stepCount === 1 ? '' : 's'}
        </Text>
    </Box>
);

type Props = {
    queries: SourceQuery[];
    terminalNodeId: string;
    /** The results shown above the panel. */
    children: ReactNode;
    defaultExpanded?: boolean;
};

/**
 * Pipeline panel: results on top, the pipeline underneath. Collapsed it is a
 * single bar; expanded it becomes a vertical splitter the user can drag.
 */
export const AiComposerPipelinePanel: FC<Props> = ({
    queries,
    terminalNodeId,
    children,
    defaultExpanded = false,
}) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const layers = useMemo(
        () => groupPipeline(queries, terminalNodeId),
        [queries, terminalNodeId],
    );
    const bar = (
        <PipelineBar
            stepCount={queries.length}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
        />
    );

    if (!expanded) {
        return (
            <Box className={styles.root}>
                <Box className={styles.results}>{children}</Box>
                {bar}
            </Box>
        );
    }

    return (
        <ResizableSplitter
            orientation="vertical"
            handleLabel="Resize results and pipeline"
            classNames={{ handle: styles.splitHandle }}
        >
            <ResizableSplitter.Pane id="results" defaultSize={55} min={15}>
                <Box className={styles.results}>{children}</Box>
            </ResizableSplitter.Pane>
            <ResizableSplitter.Pane id="pipeline" defaultSize={45} min={10}>
                <Box className={styles.root}>
                    {bar}
                    <PipelineList layers={layers} />
                </Box>
            </ResizableSplitter.Pane>
        </ResizableSplitter>
    );
};
