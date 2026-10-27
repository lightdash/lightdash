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
import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    Loader,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    createReactComponent,
    IconChevronRight,
    IconTable,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import InlineErrorState from '../../../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../../../hooks/useCompiledSql';
import { useExploreByProjectUuid } from '../../../../../../../hooks/useExplore';
import { useUiStrings } from '../../../../../../providers/Embed/useUiStrings';
import { SemanticNodeDetails } from '../SemanticNodeDetails';
import styles from './PipelineNotebook.module.css';
import { hasQueryDetails } from './semanticQueryOf';

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
    const getUiString = useUiStrings();
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
                message={getUiString(
                    'aiAgent.composer.semanticNode.compileError',
                )}
                onRetry={() => void refetch()}
            />
        );
    }
    return (
        <Group gap="xs" p="sm">
            <Loader size="xs" color="ldGray.6" />
            <Text fz="xs" c="dimmed">
                {getUiString('aiAgent.composer.semanticNode.compiling')}
            </Text>
        </Group>
    );
};

const Disclosure: FC<{
    label: string;
    open: boolean;
    onToggle: () => void;
}> = ({ label, open, onToggle }) => (
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
        {label}
    </UnstyledButton>
);

export const CompiledSqlToggle: FC<{ open: boolean; onToggle: () => void }> = ({
    open,
    onToggle,
}) => {
    const getUiString = useUiStrings();
    return (
        <Disclosure
            label={getUiString('aiAgent.composer.semanticNode.compiledSql')}
            open={open}
            onToggle={onToggle}
        />
    );
};

// Tabler 2 has no filter-lines icon: three lines narrowing to a point.
const IconFilterLines = createReactComponent(
    'filter-lines',
    'IconFilterLines',
    [
        ['path', { d: 'M4 6h16', key: 'svg-0' }],
        ['path', { d: 'M7 12h10', key: 'svg-1' }],
        ['path', { d: 'M10 18h4', key: 'svg-2' }],
    ],
);

const SemanticQuery: FC<{
    query: SemanticLayerSourceQuery;
    projectUuid: string;
}> = ({ query, projectUuid }) => {
    const getUiString = useUiStrings();
    const [open, setOpen] = useState(false);
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
    const exploreLabel = explore?.label ?? friendlyName(query.exploreName);
    const detailsLabel = getUiString(
        'aiAgent.composer.semanticNode.queryDetails',
    );
    return (
        <Box>
            <Group
                justify="space-between"
                wrap="nowrap"
                className={styles.queryHeader}
            >
                <Group gap="xs" wrap="nowrap" miw={0}>
                    <MantineIcon icon={IconTable} size={14} color="ldGray.5" />
                    <Text fz="xs" fw={500} truncate>
                        {exploreLabel}
                    </Text>
                </Group>
                {hasQueryDetails(query) && (
                    <Tooltip label={detailsLabel}>
                        <ActionIcon
                            size="sm"
                            variant={open ? 'light' : 'subtle'}
                            aria-label={detailsLabel}
                            aria-expanded={open}
                            onClick={() => setOpen((current) => !current)}
                        >
                            <MantineIcon icon={IconFilterLines} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
            <Collapse expanded={open}>
                <Box className={styles.fields}>
                    <SemanticNodeDetails
                        metricQuery={metricQuery}
                        fieldsMap={fieldsMap}
                        parameters={query.parameters ?? {}}
                    />
                </Box>
            </Collapse>
        </Box>
    );
};

/** Semantic nodes: their explore, then filters, sorts and parameters on demand. Others: their code. */
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
