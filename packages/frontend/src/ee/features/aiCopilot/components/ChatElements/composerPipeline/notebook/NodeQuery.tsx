import {
    assertUnreachable,
    formatSql,
    friendlyName,
    getItemMap,
    metricQueryOfSemanticNode,
    QuerySourceType,
    WarehouseTypes,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import { Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import InlineErrorState from '../../../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../../../hooks/useCompiledSql';
import { useExploreByProjectUuid } from '../../../../../../../hooks/useExplore';
import { useUiStrings } from '../../../../../../providers/Embed/useUiStrings';
import { SemanticNodeDetails } from '../SemanticNodeDetails';
import styles from './PipelineNotebook.module.css';

const codeOf = (
    query: Exclude<SourceQuery, SemanticLayerSourceQuery>,
): { code: string; language: 'sql' | 'python' } => {
    switch (query.sourceType) {
        case QuerySourceType.SQL:
            return { code: formatSql(query.sql), language: 'sql' };
        case QuerySourceType.DUCKDB:
        case QuerySourceType.EXTERNAL:
            return {
                code: formatSql(query.sql, WarehouseTypes.DUCKDB),
                language: 'sql',
            };
        case QuerySourceType.PYTHON:
            return { code: query.code, language: 'python' };
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

// Semantic nodes carry no SQL; mount only once shown, compiling is a fetch.
export const CompiledSql: FC<{
    query: SemanticLayerSourceQuery;
    projectUuid: string;
}> = ({ query, projectUuid }) => {
    const metricQuery = useMemo(
        () => metricQueryOfSemanticNode(query),
        [query],
    );
    const { data, error, refetch } = useCompiledSqlFromMetricQuery({
        tableName: query.exploreName,
        projectUuid,
        metricQuery,
        pivotConfiguration: query.pivotConfiguration,
    });
    if (data) {
        return (
            <Box className={styles.code}>
                <CodeBlock code={formatSql(data.query)} language="sql" />
            </Box>
        );
    }
    if (error) {
        return (
            <InlineErrorState
                message="Could not compile this query."
                onRetry={() => void refetch()}
            />
        );
    }
    return (
        <Group gap="xs" p="sm">
            <Loader size="xs" color="ldGray.6" />
            <Text fz="xs" c="dimmed">
                Compiling query…
            </Text>
        </Group>
    );
};

export const CompiledSqlToggle: FC<{ open: boolean; onToggle: () => void }> = ({
    open,
    onToggle,
}) => {
    const getUiString = useUiStrings();
    return (
        <UnstyledButton
            className={styles.disclosure}
            onClick={onToggle}
            aria-expanded={open}
        >
            <MantineIcon
                icon={IconChevronRight}
                size={12}
                className={clsx(styles.chevron, open && styles.chevronOpen)}
            />
            {getUiString('aiAgent.composer.semanticNode.compiledSql')}
        </UnstyledButton>
    );
};

const SemanticQuery: FC<{
    query: SemanticLayerSourceQuery;
    projectUuid: string;
}> = ({ query, projectUuid }) => {
    // Labels fall back to field ids, so a failed explore load stays silent.
    const { data: explore } = useExploreByProjectUuid(
        query.exploreName,
        projectUuid,
        { onError: () => {} },
    );
    const fieldsMap = useMemo(
        () =>
            explore
                ? getItemMap(
                      explore,
                      query.additionalMetrics,
                      query.tableCalculations,
                      query.customDimensions,
                  )
                : {},
        [explore, query],
    );
    const metricQuery = useMemo(
        () => metricQueryOfSemanticNode(query),
        [query],
    );
    return (
        <Box className={styles.fields}>
            <SemanticNodeDetails
                exploreLabel={explore?.label ?? friendlyName(query.exploreName)}
                metricQuery={metricQuery}
                fieldsMap={fieldsMap}
                parameters={query.parameters ?? {}}
                mutedFields
            />
        </Box>
    );
};

/** Semantic nodes: explore, fields, filters, sorts. Others: their code. */
export const NodeQuery: FC<{ query: SourceQuery; projectUuid: string }> = ({
    query,
    projectUuid,
}) =>
    query.sourceType === QuerySourceType.SEMANTIC_LAYER ? (
        <SemanticQuery query={query} projectUuid={projectUuid} />
    ) : (
        <Box className={styles.code}>
            <CodeBlock {...codeOf(query)} />
        </Box>
    );
