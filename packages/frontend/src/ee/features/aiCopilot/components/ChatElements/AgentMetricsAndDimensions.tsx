import {
    getItemLabel,
    isCompiledMetric,
    isField,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { Box, Button, Flex, HoverCard, Text } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import FieldIcon from '../../../../../components/common/Filters/FieldIcon';
import { ItemDetailPreview } from '../../../../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';

// eslint-disable-next-line css-modules/no-unused-class
import classes from './AgentMetricsAndDimensions.module.css';

type Props = {
    message: { metricQuery: MetricQuery };
    fieldsMap?: ItemsMap;
};

const getFieldDisplayName = (fieldId: string): string => {
    const parts = fieldId.split('_');
    if (parts.length <= 1) return fieldId;

    return parts
        .slice(1)
        .join(' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
};

const MetricDimensionItem: FC<{
    fieldId: string;
    type: 'metric' | 'dimension';
    exploreName: string;
    fieldsMap?: ItemsMap;
}> = ({ fieldId, type, exploreName, fieldsMap }) => {
    // Get the actual field from fieldsMap if available
    const field = fieldsMap?.[fieldId];

    // Create a mock field for styling purposes if actual field is not available
    const mockField = {
        name: fieldId,
        type: type === 'metric' ? 'number' : 'string',
        table: exploreName,
        fieldType: type === 'metric' ? 'metric' : 'dimension',
    };

    const displayName = field
        ? getItemLabel(field)
        : getFieldDisplayName(fieldId);
    const backgroundColor = type === 'dimension' ? '#d2dbe973' : '#e4dad073';
    const iconColor = type === 'dimension' ? 'blue.9' : 'yellow.9';

    // Get field description and other metadata
    const description = isField(field) ? field.description : undefined;
    const fieldName = field?.name || fieldId;

    // Get metric info if it's a metric
    const metricInfo = useMemo(() => {
        if (isCompiledMetric(field)) {
            return {
                type: field.type,
                sql: field.sql,
                compiledSql: field.compiledSql,
                filters: field.filters,
                table: field.table,
                name: field.name,
            };
        }
        return undefined;
    }, [field]);

    const isHoverCardDisabled = !description && !metricInfo;

    // Simple no-op function since we don't have ItemDetailProvider in AI context
    const onOpenDescriptionView = () => {
        // Could implement a simple modal here if needed in the future
    };

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
                        <FieldIcon
                            item={field || (mockField as any)}
                            color={iconColor}
                            size="sm"
                        />
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

const AgentMetricsAndDimensions: FC<Props> = ({ message, fieldsMap }) => {
    const metricQuery = message.metricQuery;

    if (
        !metricQuery ||
        (!metricQuery.metrics.length && !metricQuery.dimensions.length)
    ) {
        return null;
    }

    return (
        <Box mb="sm">
            <Flex gap="xs" wrap="wrap" align="center">
                {metricQuery.metrics.map((fieldId) => (
                    <MetricDimensionItem
                        key={fieldId}
                        fieldId={fieldId}
                        type="metric"
                        exploreName={metricQuery.exploreName}
                        fieldsMap={fieldsMap}
                    />
                ))}
                {metricQuery.dimensions.map((fieldId) => (
                    <MetricDimensionItem
                        key={fieldId}
                        fieldId={fieldId}
                        type="dimension"
                        exploreName={metricQuery.exploreName}
                        fieldsMap={fieldsMap}
                    />
                ))}
            </Flex>
        </Box>
    );
};

export default AgentMetricsAndDimensions;
