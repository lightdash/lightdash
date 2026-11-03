import {
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconColumns3,
    IconFilter,
    IconVariable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../../features/errorBoundary/ErrorBoundary';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import AgentVisualizationFilters from '../AgentVisualizationFilters';
import AgentVisualizationParameters from '../AgentVisualizationParameters';
import { getVisualizationFiltersCount } from '../AiVisualizationRenderer.utils';
import chipClasses from '../QueryChip.module.css';
import { DetailsRow, FieldChip } from './NodeDetailsRow';
import { nodeFieldLabel } from './nodeFieldLabel';

export type SemanticNodeQuery = Pick<
    MetricQuery,
    'dimensions' | 'metrics' | 'filters' | 'sorts'
>;

const Sorts: FC<{
    sorts: SemanticNodeQuery['sorts'];
    fieldsMap: ItemsMap;
}> = ({ sorts, fieldsMap }) => {
    const getUiString = useUiStrings();
    return (
        <Group gap={4}>
            {sorts.map((sort) => (
                <Box
                    key={sort.fieldId}
                    component="span"
                    className={chipClasses.chip}
                    data-testid="semantic-node-sort"
                >
                    <MantineIcon
                        icon={sort.descending ? IconArrowDown : IconArrowUp}
                        aria-label={getUiString(
                            sort.descending
                                ? 'aiAgent.composer.semanticNode.descending'
                                : 'aiAgent.composer.semanticNode.ascending',
                        )}
                        size={12}
                        color="ldGray.6"
                    />
                    <Text fz="xs" fw={600} truncate>
                        {nodeFieldLabel(fieldsMap, sort.fieldId)}
                    </Text>
                </Box>
            ))}
        </Group>
    );
};

type Props = {
    metricQuery: SemanticNodeQuery;
    fieldsMap: ItemsMap;
    parameters: ParametersValuesMap;
};

/** Fields, filters, parameters and sorts, each row marked by its icon. */
export const SemanticNodeDetails: FC<Props> = ({
    metricQuery,
    fieldsMap,
    parameters,
}) => {
    const getUiString = useUiStrings();
    return (
        <Stack gap={6}>
            <ErrorBoundary>
                {metricQuery.dimensions.length + metricQuery.metrics.length >
                    0 && (
                    <DetailsRow
                        icon={IconColumns3}
                        label={getUiString(
                            'aiAgent.composer.semanticNode.fields',
                        )}
                    >
                        <Group gap={4}>
                            {[
                                ...metricQuery.dimensions,
                                ...metricQuery.metrics,
                            ].map((fieldId) => (
                                <FieldChip
                                    key={fieldId}
                                    fieldId={fieldId}
                                    fieldsMap={fieldsMap}
                                />
                            ))}
                        </Group>
                    </DetailsRow>
                )}
                {getVisualizationFiltersCount(metricQuery.filters) > 0 && (
                    <DetailsRow
                        icon={IconFilter}
                        label={getUiString(
                            'aiAgent.composer.semanticNode.filters',
                        )}
                    >
                        <AgentVisualizationFilters
                            filters={metricQuery.filters}
                            fieldsMap={fieldsMap}
                            compact
                        />
                    </DetailsRow>
                )}
                {Object.keys(parameters).length > 0 && (
                    <DetailsRow
                        icon={IconVariable}
                        label={getUiString(
                            'aiAgent.composer.semanticNode.parameters',
                        )}
                    >
                        <AgentVisualizationParameters
                            parameterValues={parameters}
                            compact
                        />
                    </DetailsRow>
                )}
                {metricQuery.sorts.length > 0 && (
                    <DetailsRow
                        icon={IconArrowsSort}
                        label={getUiString(
                            'aiAgent.composer.semanticNode.sorts',
                        )}
                    >
                        <Sorts
                            sorts={metricQuery.sorts}
                            fieldsMap={fieldsMap}
                        />
                    </DetailsRow>
                )}
            </ErrorBoundary>
        </Stack>
    );
};
