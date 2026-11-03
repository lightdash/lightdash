import {
    assertUnreachable,
    formatSql,
    getItemMap,
    metricQueryOfSemanticNode,
    QuerySourceType,
    WarehouseTypes,
    type FunnelSourceQuery,
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
} from '@mantine/core';
import { createReactComponent, IconCode, type Icon } from '@tabler/icons-react';
import { useContext, useMemo, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import InlineErrorState from '../../../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../../../hooks/useCompiledSql';
import { useUiStrings } from '../../../../../../providers/Embed/useUiStrings';
import { FunnelDetailsVariantContext } from '../FunnelDetailsVariantContext';
import { FunnelNodeDetails } from '../FunnelNodeDetails';
import { SemanticNodeDetails } from '../SemanticNodeDetails';
import styles from './PipelineNotebook.module.css';
import { hasQueryDetails, type QueryPanel } from './semanticQueryOf';
import { useNodeExplore } from './useNodeExplore';

const codeOf = (
    query: Exclude<SourceQuery, SemanticLayerSourceQuery | FunnelSourceQuery>,
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
        case QuerySourceType.API:
            return { code: query.payload.query, language: 'sql' };
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

// Semantic nodes carry no SQL; mount only once shown, compiling is a fetch.
const CompiledSql: FC<{
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
        return <CodeBlock code={formatSql(data.query)} language="sql" />;
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

const ToolbarToggle: FC<{
    label: string;
    icon: Icon;
    open: boolean;
    onToggle: () => void;
}> = ({ label, icon, open, onToggle }) => (
    <Tooltip label={label}>
        <ActionIcon
            size="sm"
            aria-label={label}
            aria-expanded={open}
            onClick={onToggle}
        >
            <MantineIcon icon={icon} />
        </ActionIcon>
    </Tooltip>
);

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

type CellQueryProps = {
    query: SourceQuery;
    projectUuid: string;
    canViewSql: boolean;
    openPanels: ReadonlySet<QueryPanel>;
};

/** Toggles for a semantic cell's query views. */
export const CellQueryToggles: FC<{
    query: SemanticLayerSourceQuery;
    canViewSql: boolean;
    openPanels: ReadonlySet<QueryPanel>;
    onTogglePanel: (panel: QueryPanel) => void;
}> = ({ query, canViewSql, openPanels, onTogglePanel }) => {
    const getUiString = useUiStrings();
    return (
        <Group gap="xxs" wrap="nowrap">
            {hasQueryDetails(query) && (
                <ToolbarToggle
                    label={getUiString(
                        'aiAgent.composer.semanticNode.metricQuery',
                    )}
                    icon={IconFilterLines}
                    open={openPanels.has('details')}
                    onToggle={() => onTogglePanel('details')}
                />
            )}
            {canViewSql && (
                <ToolbarToggle
                    label={getUiString('aiAgent.composer.node.sqlQuery')}
                    icon={IconCode}
                    open={openPanels.has('sql')}
                    onToggle={() => onTogglePanel('sql')}
                />
            )}
        </Group>
    );
};

const SemanticPanels: FC<
    Omit<CellQueryProps, 'query'> & { query: SemanticLayerSourceQuery }
> = ({ query, projectUuid, canViewSql, openPanels }) => {
    const explore = useNodeExplore(query.exploreName, projectUuid);
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
        <>
            <Collapse expanded={openPanels.has('details')}>
                <Box className={styles.panel}>
                    <SemanticNodeDetails
                        metricQuery={metricQuery}
                        fieldsMap={fieldsMap}
                        parameters={query.parameters ?? {}}
                    />
                </Box>
            </Collapse>
            {canViewSql && openPanels.has('sql') && (
                <Box className={styles.codePanel}>
                    <CompiledSql query={query} projectUuid={projectUuid} />
                </Box>
            )}
        </>
    );
};

// A funnel carries no code: its details are the query, so they stay open.
const FunnelPanel: FC<{ query: FunnelSourceQuery; projectUuid: string }> = ({
    query,
    projectUuid,
}) => {
    const variant = useContext(FunnelDetailsVariantContext);
    const explore = useNodeExplore(query.exploreName, projectUuid);
    const fieldsMap = useMemo(
        () => (explore ? getItemMap(explore) : {}),
        [explore],
    );
    return (
        <Box className={styles.panel}>
            <FunnelNodeDetails
                query={query}
                fieldsMap={fieldsMap}
                variant={variant}
            />
        </Box>
    );
};

/** Semantic query views when toggled open; a funnel's details and a code cell's code, always. */
export const CellQueryPanels: FC<CellQueryProps> = ({ query, ...props }) => {
    const panel = (() => {
        switch (query.sourceType) {
            case QuerySourceType.SEMANTIC_LAYER:
                return <SemanticPanels query={query} {...props} />;
            case QuerySourceType.FUNNEL:
                return (
                    <FunnelPanel
                        query={query}
                        projectUuid={props.projectUuid}
                    />
                );
            default:
                return (
                    props.canViewSql && (
                        <Box className={styles.codePanel}>
                            <CodeBlock {...codeOf(query)} />
                        </Box>
                    )
                );
        }
    })();
    return <Box className={styles.panels}>{panel}</Box>;
};
