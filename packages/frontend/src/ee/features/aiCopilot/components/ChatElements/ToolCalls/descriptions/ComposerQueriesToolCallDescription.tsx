import {
    QuerySourceType,
    type ToolComposerQueriesArgs,
} from '@lightdash/common';
import { Code, Stack, Text } from '@mantine/core';
import type { FC } from 'react';

type ComposerQueriesToolCallDescriptionProps = {
    queries: ToolComposerQueriesArgs['queries'];
};

const nodeSummary = (
    node: ToolComposerQueriesArgs['queries'][number],
): string => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return `${node.nodeId} — metric query on ${node.exploreName}`;
        case QuerySourceType.SQL:
            return `${node.nodeId} — warehouse SQL`;
        case QuerySourceType.DUCKDB:
            return `${node.nodeId} — DuckDB over ${
                Array.isArray(node.references)
                    ? node.references.join(', ')
                    : Object.values(node.references).join(', ')
            }`;
        default:
            return '';
    }
};

export const ComposerQueriesToolCallDescription: FC<
    ComposerQueriesToolCallDescriptionProps
> = ({ queries }) => {
    return (
        <Stack gap={6} align="stretch" w="100%">
            {queries.map((node) => (
                <Stack gap={2} key={node.nodeId}>
                    <Text c="dimmed" size="xs">
                        {nodeSummary(node)}
                    </Text>
                    {'sql' in node && node.sql ? (
                        <Code
                            block
                            style={{
                                boxSizing: 'border-box',
                                display: 'block',
                                fontSize: 11,
                                maxHeight: 160,
                                overflow: 'auto',
                                width: '100%',
                            }}
                        >
                            {node.sql}
                        </Code>
                    ) : null}
                </Stack>
            ))}
        </Stack>
    );
};
