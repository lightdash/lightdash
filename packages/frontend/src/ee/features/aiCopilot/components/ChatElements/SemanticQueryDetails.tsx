import { type ItemsMap, type ParametersValuesMap } from '@lightdash/common';
import { Badge, Box, Button, Collapse, Group, Stack } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconChevronDown,
    IconChevronUp,
    IconColumns3,
    IconFilter,
    IconVariable,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';
import AgentVisualizationParameters from './AgentVisualizationParameters';
import styles from './SemanticQueryDetails.module.css';
import {
    semanticItemLabel,
    useSemanticQuerySummary,
    type SemanticQueryDetailsQuery,
    type SemanticQuerySummary,
    type SemanticQuerySummaryOptions,
} from './useSemanticQuerySummary';

const DetailsRow: FC<{ icon: Icon; children: ReactNode }> = ({
    icon,
    children,
}) => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
        <Box className={styles.rowIcon}>
            <MantineIcon icon={icon} size={13} color="ldGray.5" />
        </Box>
        <Box flex={1} miw={0}>
            {children}
        </Box>
    </Group>
);

const Sorts: FC<{
    sorts: SemanticQueryDetailsQuery['sorts'];
    fieldsMap: ItemsMap;
}> = ({ sorts, fieldsMap }) => {
    const getUiString = useUiStrings();
    return (
        <Group gap={4}>
            {sorts.map((sort) => (
                <Badge
                    key={sort.fieldId}
                    variant="default"
                    className={styles.sortChip}
                    data-testid="semantic-query-sort"
                    leftSection={
                        <MantineIcon
                            icon={sort.descending ? IconArrowDown : IconArrowUp}
                            aria-label={getUiString(
                                sort.descending
                                    ? 'aiAgent.queryDetails.descending'
                                    : 'aiAgent.queryDetails.ascending',
                            )}
                            size={12}
                            color="ldGray.6"
                        />
                    }
                >
                    {semanticItemLabel(fieldsMap, sort.fieldId)}
                </Badge>
            ))}
        </Group>
    );
};

type BodyProps = {
    metricQuery: SemanticQueryDetailsQuery;
    fieldsMap: ItemsMap;
    parameters: ParametersValuesMap;
    summary: SemanticQuerySummary;
    /** Field chips; each surface keeps its own field style. */
    fields: ReactNode;
};

/** Fields, then filters, parameters and sorts, each row marked by its icon. */
export const SemanticQueryDetailsBody: FC<BodyProps> = ({
    metricQuery,
    fieldsMap,
    parameters,
    summary,
    fields,
}) => (
    <Stack gap={6}>
        <ErrorBoundary>
            {summary.fieldsCount > 0 && (
                <DetailsRow icon={IconColumns3}>{fields}</DetailsRow>
            )}
            {summary.filtersCount > 0 && (
                <DetailsRow icon={IconFilter}>
                    <AgentVisualizationFilters
                        filters={metricQuery.filters}
                        fieldsMap={fieldsMap}
                        compact
                    />
                </DetailsRow>
            )}
            {summary.parametersCount > 0 && (
                <DetailsRow icon={IconVariable}>
                    <AgentVisualizationParameters
                        parameterValues={parameters}
                    />
                </DetailsRow>
            )}
            {summary.sortsCount > 0 && (
                <DetailsRow icon={IconArrowsSort}>
                    <Sorts sorts={metricQuery.sorts} fieldsMap={fieldsMap} />
                </DetailsRow>
            )}
        </ErrorBoundary>
    </Stack>
);

type Props = SemanticQuerySummaryOptions & { fieldsMap: ItemsMap };

/** A collapsed count line that expands to a semantic query's fields, filters, parameters and sorts. */
export const SemanticQueryDetails: FC<Props> = ({ fieldsMap, ...options }) => {
    const [expanded, setExpanded] = useState(false);
    const summary = useSemanticQuerySummary(options);
    if (!summary.expandable) return null;

    return (
        <Stack gap="xs">
            <Group>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="ldGray"
                    c="dimmed"
                    flex="0 0 auto"
                    bd="none"
                    aria-expanded={expanded}
                    rightSection={
                        <MantineIcon
                            icon={expanded ? IconChevronUp : IconChevronDown}
                            size={12}
                        />
                    }
                    onClick={() => setExpanded((value) => !value)}
                >
                    {summary.parts.join(' · ')}
                </Button>
            </Group>
            <Collapse expanded={expanded}>
                <SemanticQueryDetailsBody
                    metricQuery={options.metricQuery}
                    fieldsMap={fieldsMap}
                    parameters={options.parameters}
                    summary={summary}
                    fields={
                        <AgentVisualizationMetricsAndDimensions
                            metricQuery={options.metricQuery}
                            fieldsMap={fieldsMap}
                        />
                    }
                />
            </Collapse>
        </Stack>
    );
};
