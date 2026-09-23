import {
    QuerySourceType,
    type AiComposerChartArtifactConfig,
    type ToolComposerQueriesArgs,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Popover,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import CodeBlock from '../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PrototypeVariantSwitcher } from '../../../../../components/common/PrototypeVariantSwitcher';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import styles from './AiComposerArtifactPrototype.module.css';
import { AiComposerArtifactVisualization } from './AiComposerArtifactVisualization';
import { AiComposerPipelinePanel } from './AiComposerPipelineFooter';
import {
    COMPOSER_PROTOTYPE_VARIANTS,
    useComposerPrototypeVariant,
} from './composerPrototypeVariants';
import { ComposerQueriesToolCallDescription } from './ToolCalls/descriptions/ComposerQueriesToolCallDescription';

// PROTOTYPE ONLY. Four renderings of a composer artifact on the real thread
// route, switchable via `?variant=`: where does the pipeline live?

type ToolNodes = ToolComposerQueriesArgs['queries'];

/** Artifact stores SourceQuery[]; the node cards take the tool-arg shape. */
const toToolNodes = (
    queries: AiComposerChartArtifactConfig['queries'],
): ToolNodes =>
    queries.flatMap<ToolNodes[number]>((query, index) => {
        const nodeId = query.nodeId ?? `query_${index + 1}`;
        const limit = query.limit ?? 500;
        switch (query.sourceType) {
            case QuerySourceType.SEMANTIC_LAYER:
                return [
                    {
                        sourceType: query.sourceType,
                        nodeId,
                        exploreName: query.exploreName,
                        dimensions: query.dimensions,
                        metrics: query.metrics,
                        filters: query.filters ?? null,
                        sorts: query.sorts ?? null,
                        limit,
                    },
                ];
            case QuerySourceType.SQL:
                return [
                    {
                        sourceType: query.sourceType,
                        nodeId,
                        sql: query.sql,
                        limit,
                    },
                ];
            case QuerySourceType.DUCKDB:
                return [
                    {
                        sourceType: query.sourceType,
                        nodeId,
                        sql: query.sql,
                        references: query.references ?? [],
                        limit,
                    },
                ];
            case QuerySourceType.EXTERNAL:
                return [
                    {
                        sourceType: query.sourceType,
                        nodeId,
                        sql: query.sql,
                        tables: query.tables,
                        limit,
                    },
                ];
            default:
                return [];
        }
    });

type VariantProps = {
    config: AiComposerChartArtifactConfig;
    nodes: ToolNodes;
    results: InfiniteQueryResults;
    headerContent: ReactNode;
};

/** A — results on top, pipeline as a collapsible, resizable bottom panel. */
const VariantFooter: FC<VariantProps> = ({
    config,
    nodes,
    results,
    headerContent,
}) => (
    <AiComposerPipelinePanel
        nodes={nodes}
        terminalNodeId={config.terminalNodeId}
        durationLabel={null}
    >
        <Box className={styles.flushResults}>
            <AiComposerArtifactVisualization
                results={results}
                headerContent={
                    <Box className={styles.flushHeader}>{headerContent}</Box>
                }
            />
        </Box>
    </AiComposerPipelinePanel>
);

/** B — header carries a Results / Pipeline segmented control. */
const VariantTabs: FC<VariantProps> = ({
    config,
    nodes,
    results,
    headerContent,
}) => {
    const [tab, setTab] = useState<'results' | 'pipeline'>('results');
    return (
        <Stack gap="sm" h="100%" mih={0}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                {headerContent}
                <SegmentedControl
                    size="xs"
                    value={tab}
                    onChange={(value) =>
                        setTab(value === 'pipeline' ? 'pipeline' : 'results')
                    }
                    data={[
                        { label: 'Results', value: 'results' },
                        {
                            label: `Pipeline · ${nodes.length}`,
                            value: 'pipeline',
                        },
                    ]}
                />
            </Group>
            <Box className={styles.tabBody}>
                {tab === 'results' ? (
                    <AiComposerArtifactVisualization
                        results={results}
                        headerContent={null}
                    />
                ) : (
                    <Stack gap="xs">
                        <Text fz="xs" c="dimmed">
                            Shows the result of{' '}
                            <Text component="span" ff="monospace" fw={600}>
                                {config.terminalNodeId}
                            </Text>
                        </Text>
                        <ComposerQueriesToolCallDescription queries={nodes} />
                    </Stack>
                )}
            </Box>
        </Stack>
    );
};

const nodeBadge = (node: ToolNodes[number]) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return { label: 'Semantic', color: 'indigo' };
        case QuerySourceType.SQL:
            return { label: 'SQL', color: 'ldGray.6' };
        case QuerySourceType.EXTERNAL:
            return { label: 'External', color: 'cyan' };
        case QuerySourceType.DUCKDB:
            return { label: 'DuckDB', color: 'violet' };
        default:
            return { label: 'Node', color: 'ldGray.6' };
    }
};

/** C — a horizontal node strip between header and table; each node pops its SQL. */
const VariantStrip: FC<VariantProps> = ({
    config,
    nodes,
    results,
    headerContent,
}) => (
    <Stack gap="sm" h="100%" mih={0}>
        {headerContent}
        <Box className={styles.strip}>
            {nodes.map((node, index) => {
                const badge = nodeBadge(node);
                const sql = 'sql' in node ? node.sql : null;
                const detail =
                    node.sourceType === QuerySourceType.SEMANTIC_LAYER
                        ? `${node.exploreName}: ${[
                              ...node.dimensions,
                              ...node.metrics,
                          ].join(', ')}`
                        : null;
                return (
                    <Group key={node.nodeId} gap={6} wrap="nowrap">
                        {index > 0 && (
                            <MantineIcon
                                icon={IconArrowRight}
                                size={12}
                                className={styles.stripArrow}
                            />
                        )}
                        <Popover
                            width={420}
                            position="bottom-start"
                            shadow="md"
                        >
                            <Popover.Target>
                                <Box
                                    className={styles.stripNode}
                                    data-terminal={
                                        node.nodeId === config.terminalNodeId
                                    }
                                >
                                    <Text
                                        component="span"
                                        className={styles.stripNodeId}
                                    >
                                        {node.nodeId}
                                    </Text>
                                    <Badge size="xs" color={badge.color}>
                                        {badge.label}
                                    </Badge>
                                </Box>
                            </Popover.Target>
                            <Popover.Dropdown p="xs">
                                {sql ? (
                                    <CodeBlock code={sql} language="sql" />
                                ) : (
                                    <Text fz="xs">{detail}</Text>
                                )}
                            </Popover.Dropdown>
                        </Popover>
                    </Group>
                );
            })}
        </Box>
        <Box className={styles.tabBody}>
            <AiComposerArtifactVisualization
                results={results}
                headerContent={null}
            />
        </Box>
    </Stack>
);

export const AiComposerArtifactPrototype: FC<{
    config: AiComposerChartArtifactConfig;
    results: InfiniteQueryResults;
    headerContent: ReactNode;
}> = ({ config, results, headerContent }) => {
    const { current, setVariant } = useComposerPrototypeVariant();
    const nodes = useMemo(() => toToolNodes(config.queries), [config.queries]);
    const props = { config, nodes, results, headerContent };

    return (
        <>
            {current === 'A' ? (
                <VariantFooter {...props} />
            ) : (
                <Box className={styles.paddedContent}>
                    {current === 'today' && (
                        <AiComposerArtifactVisualization
                            results={results}
                            headerContent={headerContent}
                        />
                    )}
                    {current === 'B' && <VariantTabs {...props} />}
                    {current === 'C' && <VariantStrip {...props} />}
                </Box>
            )}
            <PrototypeVariantSwitcher
                variants={COMPOSER_PROTOTYPE_VARIANTS}
                current={current}
                onChange={setVariant}
            />
        </>
    );
};
