import {
    friendlyName,
    getItemLabel,
    isCompiledMetric,
    isDimension,
    isField,
    isMetric,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { Box, Button, Flex, HoverCard, Text } from '@mantine-8/core';
import { lighten } from 'polished';
import { type FC } from 'react';
import FieldIcon from '../../../../../components/common/Filters/FieldIcon';
import { ItemDetailPreview } from '../../../../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';
import { getItemBgColor } from '../../../../../hooks/useColumns';

import classes from './AgentVisualizationMetricsAndDimensions.module.css';

const MetricDimensionItem: FC<{
    fieldId: string;
    type: 'metric' | 'dimension';
    fieldsMap: ItemsMap;
}> = ({ fieldId, type, fieldsMap }) => {
    const field = fieldsMap[fieldId];

    if (!field) {
        return null;
    }

    if (!isMetric(field) && !isDimension(field)) {
        return null;
    }

    const displayName = field ? getItemLabel(field) : friendlyName(fieldId);
    const backgroundColor = lighten(0.05, getItemBgColor(field));
    const iconColor = type === 'dimension' ? 'blue.9' : 'yellow.9';

    // Get field description and other metadata
    const description = isField(field) ? field.description : undefined;
    const fieldName = field?.name || fieldId;

    // Get metric info if it's a metric
    const metricInfo = isCompiledMetric(field)
        ? {
              type: field.type,
              sql: field.sql,
              compiledSql: field.compiledSql,
              filters: field.filters,
              table: field.table,
              name: field.name,
          }
        : undefined;

    const isHoverCardDisabled = !description && !metricInfo;

    const onOpenDescriptionView = () => {};
    const handleDropdownClick = (e: React.MouseEvent) => e.stopPropagation();

    return (
        <HoverCard
            openDelay={300}
            keepMounted={false}
            shadow="subtle"
            withinPortal
            withArrow
            disabled={isHoverCardDisabled}
            position="top"
            radius="md"
            offset={10}
        >
            <HoverCard.Target>
                <Button
                    size="xs"
                    variant="default"
                    className={classes.itemButton}
                    style={{ backgroundColor }}
                    styles={{
                        inner: {
                            color: 'black',
                        },
                        label: {
                            maxWidth: '100%',
                        },
                    }}
                    bd="none"
                >
                    <Flex align="center" gap="xs">
                        <FieldIcon item={field} color={iconColor} size="sm" />
                        <Box className={classes.itemText}>
                            <Text fz="xs" truncate>
                                {displayName}
                            </Text>
                        </Box>
                    </Flex>
                </Button>
            </HoverCard.Target>
            <HoverCard.Dropdown
                p="xs"
                miw={300}
                mah={400}
                maw={400}
                style={{ overflow: 'auto' }}
                onClick={handleDropdownClick}
            >
                <ItemDetailPreview
                    onViewDescription={onOpenDescriptionView}
                    description={description}
                    metricInfo={metricInfo}
                />
                {!description && !metricInfo && (
                    <Box>
                        <Text fz="sm" fw={500} mb="xs">
                            {fieldName}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            Field ID: {fieldId}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            Type: {type}
                        </Text>
                    </Box>
                )}
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

type Props = {
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
};

const AgentVisualizationMetricsAndDimensions: FC<Props> = ({
    metricQuery,
    fieldsMap,
}) => {
    if (!metricQuery.metrics.length && !metricQuery.dimensions.length) {
        return null;
    }

    return (
        <>
            <Flex gap="xs" wrap="wrap" align="center">
                {metricQuery.metrics.map((fieldId) => (
                    <MetricDimensionItem
                        key={fieldId}
                        fieldId={fieldId}
                        type="metric"
                        fieldsMap={fieldsMap}
                    />
                ))}
                {metricQuery.dimensions.map((fieldId) => (
                    <MetricDimensionItem
                        key={fieldId}
                        fieldId={fieldId}
                        type="dimension"
                        fieldsMap={fieldsMap}
                    />
                ))}
            </Flex>
        </>
    );
};

export default AgentVisualizationMetricsAndDimensions;
