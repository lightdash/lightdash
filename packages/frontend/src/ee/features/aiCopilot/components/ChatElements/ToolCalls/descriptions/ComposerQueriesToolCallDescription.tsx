import {
    formatSql,
    QuerySourceType,
    type ToolComposerQueriesArgs,
    type ToolComposerQueryNode,
    WarehouseTypes,
} from '@lightdash/common';
import { Badge, Box, Group, Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import styles from './ComposerQueriesToolCallDescription.module.css';

type ComposerQueriesToolCallDescriptionProps = {
    queries: ToolComposerQueriesArgs['queries'];
};

const referenceAliases = (items: string[] | Record<string, string>) =>
    Array.isArray(items) ? items : Object.keys(items);

const getNodePresentation = (node: ToolComposerQueryNode) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return {
                badge: 'Semantic layer',
                color: 'indigo',
                detail: `${node.exploreName} · ${node.dimensions.length} dimension${node.dimensions.length === 1 ? '' : 's'} · ${node.metrics.length} metric${node.metrics.length === 1 ? '' : 's'}`,
            } as const;
        case QuerySourceType.SQL:
            return {
                badge: 'Warehouse SQL',
                color: 'ldGray.6',
                detail: 'Project warehouse',
            } as const;
        case QuerySourceType.EXTERNAL: {
            const tables = referenceAliases(node.tables);
            return {
                badge: 'External data',
                color: 'cyan',
                detail: `Reads ${tables.join(', ')}`,
            } as const;
        }
        case QuerySourceType.DUCKDB: {
            const references = referenceAliases(node.references);
            return {
                badge: 'DuckDB compose',
                color: 'violet',
                detail: `Combines ${references.join(', ')}`,
            } as const;
        }
    }
};

const ComposerQueryNode: FC<{ node: ToolComposerQueryNode }> = ({ node }) => {
    const presentation = getNodePresentation(node);
    const formattedSql = useMemo(() => {
        if (!('sql' in node) || !node.sql) return null;

        return formatSql(
            node.sql,
            node.sourceType === QuerySourceType.DUCKDB ||
                node.sourceType === QuerySourceType.EXTERNAL
                ? WarehouseTypes.DUCKDB
                : undefined,
        );
    }, [node]);

    return (
        <Box className={styles.node}>
            <Group gap={6} wrap="nowrap" className={styles.header}>
                <Text component="span" className={styles.nodeId}>
                    {node.nodeId}
                </Text>
                <Badge
                    color={presentation.color}
                    size="xs"
                    variant="light"
                    className={styles.badge}
                >
                    {presentation.badge}
                </Badge>
                <Text size="xs" c="dimmed" truncate className={styles.detail}>
                    {presentation.detail}
                </Text>
            </Group>
            {formattedSql ? (
                <Box className={styles.code}>
                    <CodeBlock code={formattedSql} language="sql" />
                </Box>
            ) : null}
        </Box>
    );
};

export const ComposerQueriesToolCallDescription: FC<
    ComposerQueriesToolCallDescriptionProps
> = ({ queries }) => (
    <Stack gap={10} align="stretch" w="100%" className={styles.pipeline}>
        {queries.map((node) => (
            <ComposerQueryNode key={node.nodeId} node={node} />
        ))}
    </Stack>
);
