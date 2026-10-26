import {
    friendlyName,
    getItemLabelWithoutTableName,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { Badge, Box, Group, Stack } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconColumns3,
    IconFilter,
    IconVariable,
    type Icon,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../../features/errorBoundary/ErrorBoundary';
import { LD_FIELD_COLORS } from '../../../../../../theme/fieldColors';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import AgentVisualizationFilters from '../AgentVisualizationFilters';
import AgentVisualizationParameters from '../AgentVisualizationParameters';
import { getVisualizationFiltersCount } from '../AiVisualizationRenderer.utils';
import styles from './SemanticNodeDetails.module.css';

export type SemanticNodeQuery = Pick<
    MetricQuery,
    'dimensions' | 'metrics' | 'filters' | 'sorts'
>;

const semanticItemLabel = (fieldsMap: ItemsMap, fieldId: string) => {
    const item = fieldsMap[fieldId];
    return item ? getItemLabelWithoutTableName(item) : friendlyName(fieldId);
};

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

const FieldChip: FC<{
    fieldId: string;
    type: 'dimension' | 'metric';
    fieldsMap: ItemsMap;
}> = ({ fieldId, type, fieldsMap }) => (
    <Box
        component="span"
        className={styles.fieldChip}
        bg={LD_FIELD_COLORS[type].bg}
        c={LD_FIELD_COLORS[type].color}
    >
        {semanticItemLabel(fieldsMap, fieldId)}
    </Box>
);

const Sorts: FC<{
    sorts: SemanticNodeQuery['sorts'];
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
                    data-testid="semantic-node-sort"
                    leftSection={
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
                    }
                >
                    {semanticItemLabel(fieldsMap, sort.fieldId)}
                </Badge>
            ))}
        </Group>
    );
};

type Props = {
    metricQuery: SemanticNodeQuery;
    fieldsMap: ItemsMap;
    parameters: ParametersValuesMap;
};

/** Fields, then filters, parameters and sorts, each row marked by its icon. */
export const SemanticNodeDetails: FC<Props> = ({
    metricQuery,
    fieldsMap,
    parameters,
}) => (
    <Stack gap={6}>
        <ErrorBoundary>
            {metricQuery.dimensions.length + metricQuery.metrics.length > 0 && (
                <DetailsRow icon={IconColumns3}>
                    <Group gap={4}>
                        {metricQuery.dimensions.map((fieldId) => (
                            <FieldChip
                                key={fieldId}
                                fieldId={fieldId}
                                type="dimension"
                                fieldsMap={fieldsMap}
                            />
                        ))}
                        {metricQuery.metrics.map((fieldId) => (
                            <FieldChip
                                key={fieldId}
                                fieldId={fieldId}
                                type="metric"
                                fieldsMap={fieldsMap}
                            />
                        ))}
                    </Group>
                </DetailsRow>
            )}
            {getVisualizationFiltersCount(metricQuery.filters) > 0 && (
                <DetailsRow icon={IconFilter}>
                    <AgentVisualizationFilters
                        filters={metricQuery.filters}
                        fieldsMap={fieldsMap}
                        compact
                    />
                </DetailsRow>
            )}
            {Object.keys(parameters).length > 0 && (
                <DetailsRow icon={IconVariable}>
                    <AgentVisualizationParameters
                        parameterValues={parameters}
                        compact
                    />
                </DetailsRow>
            )}
            {metricQuery.sorts.length > 0 && (
                <DetailsRow icon={IconArrowsSort}>
                    <Sorts sorts={metricQuery.sorts} fieldsMap={fieldsMap} />
                </DetailsRow>
            )}
        </ErrorBoundary>
    </Stack>
);
