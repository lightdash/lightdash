import {
    assertUnreachable,
    formatSql,
    friendlyName,
    getItemMap,
    metricQueryOfSemanticNode,
    QuerySourceType,
    WarehouseTypes,
    type MergeSourceQuery,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    HoverCard,
    Loader,
    ScrollArea,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    createReactComponent,
    IconArrowsJoin,
    IconChevronRight,
    IconCode,
    IconTable,
    type Icon,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { Fragment, useId, useMemo, useState, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import InlineErrorState from '../../../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { ItemDetailMarkdown } from '../../../../../../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';
import { useCompiledSqlFromMetricQuery } from '../../../../../../../hooks/useCompiledSql';
import { useExploreByProjectUuid } from '../../../../../../../hooks/useExplore';
import { useUiStrings } from '../../../../../../providers/Embed/useUiStrings';
import { MergeNodeDetails } from '../MergeNodeDetails';
import { SemanticNodeDetails } from '../SemanticNodeDetails';
import { useMergeNodeCopy } from '../useMergeNodeCopy';
import { isLongCode } from './codeCollapse';
import styles from './PipelineNotebook.module.css';
import { hasQueryDetails, type QueryPanel } from './semanticQueryOf';
import { type MergeNodeView } from './useMergeNodeView';

type CellCode = { code: string; language: 'sql' | 'python' };

const codeOf = (
    query: Exclude<SourceQuery, SemanticLayerSourceQuery | MergeSourceQuery>,
): CellCode => {
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

// Long code opens as a short preview; copy still copies all of it.
const NotebookCode: FC<CellCode> = ({ code, language }) => {
    const getUiString = useUiStrings();
    const codeId = useId();
    const [expanded, setExpanded] = useState(false);
    if (!isLongCode(code)) {
        return <CodeBlock code={code} language={language} />;
    }
    return (
        <>
            <Box
                id={codeId}
                className={styles.collapsibleCode}
                data-collapsed={!expanded}
            >
                <CodeBlock
                    code={code}
                    language={language}
                    expanded={expanded}
                    classNames={{ showCodeButton: styles.nativeExpandButton }}
                />
            </Box>
            <UnstyledButton
                className={styles.codeToggle}
                aria-expanded={expanded}
                aria-controls={codeId}
                onClick={() => setExpanded((open) => !open)}
            >
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    className={clsx(
                        styles.chevron,
                        expanded && styles.chevronOpen,
                    )}
                />
                <Text component="span" fz="xs" c="dimmed">
                    {getUiString(
                        expanded
                            ? 'aiAgent.composer.node.showLessCode'
                            : language === 'sql'
                              ? 'aiAgent.composer.node.showFullSql'
                              : 'aiAgent.composer.node.showFullCode',
                    )}
                </Text>
            </UnstyledButton>
        </>
    );
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
        return <NotebookCode code={formatSql(data.query)} language="sql" />;
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

// Labels fall back to field ids, so a failed explore load stays silent.
const useNodeExplore = (query: SemanticLayerSourceQuery, projectUuid: string) =>
    useExploreByProjectUuid(query.exploreName, projectUuid, {
        onError: () => {},
    }).data;

/** The explore a semantic cell reads, with its description on hover. */
export const ExploreSource: FC<{
    query: SemanticLayerSourceQuery;
    projectUuid: string;
}> = ({ query, projectUuid }) => {
    const explore = useNodeExplore(query, projectUuid);
    const label = explore?.label ?? friendlyName(query.exploreName);
    const description = explore?.tables[explore.baseTable]?.description;
    return (
        <HoverCard
            openDelay={300}
            keepMounted={false}
            withArrow
            disabled={!description}
            position="top"
        >
            <HoverCard.Target>
                <Group gap={4} wrap="nowrap" miw={0} className={styles.source}>
                    <MantineIcon icon={IconTable} size={14} stroke={1.5} />
                    <Text fz="xs" fw={500} truncate>
                        {label}
                    </Text>
                </Group>
            </HoverCard.Target>
            <HoverCard.Dropdown p="xs" miw={300} maw={400}>
                <ScrollArea.Autosize mah={300}>
                    {description && <ItemDetailMarkdown source={description} />}
                </ScrollArea.Autosize>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

/** The merge in one line, as the Explorer's merge bar sums it up. */
export const MergeSummary: FC<{ view: MergeNodeView }> = ({ view }) => {
    const getUiString = useUiStrings();
    const { joinTypeLabel } = useMergeNodeCopy();
    const vars: Record<string, string> = {
        key: view.summary.keyLabel,
        rows: joinTypeLabel(view.summary),
    };
    const template = getUiString('aiAgent.composer.mergeNode.summary');
    return (
        <Group gap={4} wrap="nowrap" miw={0} className={styles.source}>
            <MantineIcon icon={IconArrowsJoin} size={14} stroke={1.5} />
            <Text fz="xs" c="dimmed" truncate>
                {template.split(/(\{\w+\})/).map((part, index) => {
                    const value = vars[part.slice(1, -1)];
                    return value === undefined ? (
                        // eslint-disable-next-line react/no-array-index-key
                        <Fragment key={index}>{part}</Fragment>
                    ) : (
                        <Text
                            // eslint-disable-next-line react/no-array-index-key
                            key={index}
                            span
                            fz="xs"
                            fw={500}
                            className={styles.summaryValue}
                        >
                            {value}
                        </Text>
                    );
                })}
            </Text>
        </Group>
    );
};

export const MergeCellToggles: FC<{
    openPanels: ReadonlySet<QueryPanel>;
    onTogglePanel: (panel: QueryPanel) => void;
}> = ({ openPanels, onTogglePanel }) => {
    const getUiString = useUiStrings();
    return (
        <ToolbarToggle
            label={getUiString('aiAgent.composer.mergeNode.setup')}
            icon={IconFilterLines}
            open={openPanels.has('details')}
            onToggle={() => onTogglePanel('details')}
        />
    );
};

export const MergePanels: FC<{
    view: MergeNodeView;
    openPanels: ReadonlySet<QueryPanel>;
}> = ({ view, openPanels }) => (
    <Box className={styles.panels}>
        <Collapse expanded={openPanels.has('details')}>
            <Box className={styles.panel}>
                <MergeNodeDetails {...view} />
            </Box>
        </Collapse>
    </Box>
);

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
    const explore = useNodeExplore(query, projectUuid);
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

/** Semantic query views when toggled open; a code cell's code, always. */
export const CellQueryPanels: FC<CellQueryProps> = ({ query, ...props }) => (
    <Box className={styles.panels}>
        {query.sourceType === QuerySourceType.SEMANTIC_LAYER ? (
            <SemanticPanels query={query} {...props} />
        ) : query.sourceType === QuerySourceType.MERGE ? null : (
            props.canViewSql && (
                <Box className={styles.codePanel}>
                    <NotebookCode {...codeOf(query)} />
                </Box>
            )
        )}
    </Box>
);
