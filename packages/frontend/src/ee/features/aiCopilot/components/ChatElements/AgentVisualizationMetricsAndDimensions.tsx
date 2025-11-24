import {
    friendlyName,
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isCompiledMetric,
    isDimension,
    isField,
    isMetric,
    type AdditionalMetric,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Flex,
    HoverCard,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { IconCode } from '@tabler/icons-react';
import { lighten } from 'polished';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import FieldIcon from '../../../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ItemDetailPreview } from '../../../../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';
import { getItemBgColor } from '../../../../../hooks/useColumns';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';

import { SingleItemModalContent } from '../../../../../components/Explorer/WriteBackModal';
import classes from './AgentVisualizationMetricsAndDimensions.module.css';

const MetricDimensionItem: FC<{
    fieldId: string;
    type: 'metric' | 'dimension';
    fieldsMap: ItemsMap;
    showTablePrefix: boolean;
    customMetric?: AdditionalMetric;
    onWriteBackCustomMetric?: (metric: AdditionalMetric) => void;
}> = ({
    fieldId,
    type,
    fieldsMap,
    showTablePrefix,
    customMetric,
    onWriteBackCustomMetric,
}) => {
    const theme = useMantineTheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { track } = useTracking();
    const [isCodeIconHovered, setIsCodeIconHovered] = useState(false);

    // If it's a custom metric, use it directly, otherwise get from fieldsMap
    const field = customMetric || fieldsMap[fieldId];
    const isCustomMetric = !!customMetric;

    if (!field) {
        return null;
    }

    if (!isCustomMetric && !isMetric(field) && !isDimension(field)) {
        return null;
    }

    let displayName = '';

    if (isField(field)) {
        displayName = showTablePrefix
            ? getItemLabel(field)
            : getItemLabelWithoutTableName(field);
    } else {
        displayName = friendlyName(fieldId);
    }

    const backgroundColor = lighten(0.05, getItemBgColor(field, theme));
    const iconColor = type === 'dimension' ? 'blue.9' : 'yellow.9';

    const description = isField(field) ? field.description : undefined;
    const fieldName = field?.name || fieldId;

    const metricInfo = isCustomMetric
        ? {
              type: customMetric.type,
              sql: customMetric.sql,
              compiledSql: customMetric.sql, // Using sql as compiledSql for custom metrics
              name: customMetric.name,
              filters: customMetric.filters,
          }
        : isCompiledMetric(field)
        ? {
              type: field.type,
              sql: field.sql,
              compiledSql: field.compiledSql,
              filters: field.filters,
              table: field.table,
              name: field.name,
          }
        : undefined;

    const isHoverCardDisabled =
        (!description && !metricInfo) || isCodeIconHovered;

    const onOpenDescriptionView = () => {};
    const handleDropdownClick = (e: React.MouseEvent) => e.stopPropagation();

    const handleWriteBack = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (projectUuid && user.data?.organizationUuid) {
            track({
                name: EventName.WRITE_BACK_FROM_CUSTOM_METRIC_CLICKED,
                properties: {
                    userId: user.data.userUuid,
                    projectId: projectUuid,
                    organizationId: user.data.organizationUuid,
                    customMetricsCount: 1,
                },
            });
        }
        if (onWriteBackCustomMetric && customMetric) {
            onWriteBackCustomMetric(customMetric);
        }
    };

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
                    rightSection={
                        isCustomMetric &&
                        onWriteBackCustomMetric && (
                            <Tooltip
                                openDelay={200}
                                position="top"
                                label="Write back to dbt"
                                withArrow
                                offset={5}
                            >
                                <ActionIcon
                                    variant="light"
                                    size="xs"
                                    color="grape.7"
                                    onClick={handleWriteBack}
                                    onMouseEnter={() =>
                                        setIsCodeIconHovered(true)
                                    }
                                    onMouseLeave={() =>
                                        setIsCodeIconHovered(false)
                                    }
                                >
                                    <MantineIcon
                                        icon={IconCode}
                                        size={12}
                                        strokeWidth={2.5}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )
                    }
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [writeBackModal, setWriteBackModal] = useState<{
        isOpen: boolean;
        metric: AdditionalMetric | null;
    }>({ isOpen: false, metric: null });

    const handleWriteBack = (metric: AdditionalMetric) => {
        setWriteBackModal({ isOpen: true, metric });
    };

    const handleCloseModal = () => {
        setWriteBackModal({ isOpen: false, metric: null });
    };

    const numberOfExplores = useMemo(() => {
        const tables = new Set<string>();

        // Check regular fields
        [...metricQuery.metrics, ...metricQuery.dimensions].forEach(
            (fieldId) => {
                const field = fieldsMap[fieldId];
                if (field && isField(field)) {
                    tables.add(field.table);
                }
            },
        );

        // Check additional metrics
        metricQuery.additionalMetrics?.forEach((metric) => {
            if (metric.table) {
                tables.add(metric.table);
            }
        });

        return tables.size;
    }, [
        metricQuery.metrics,
        metricQuery.dimensions,
        metricQuery.additionalMetrics,
        fieldsMap,
    ]);

    const showTablePrefix = numberOfExplores > 1;

    if (
        !metricQuery.metrics.length &&
        !metricQuery.dimensions.length &&
        !metricQuery.additionalMetrics?.length
    ) {
        return null;
    }

    const additionalMetrics = metricQuery.additionalMetrics ?? [];

    return (
        <>
            <Flex gap="xs" wrap="wrap" align="center">
                {metricQuery.metrics.map((fieldId) => {
                    // Check if this metric is actually a custom metric
                    const customMetric = additionalMetrics.find(
                        (am) => getItemId(am) === fieldId,
                    );

                    return (
                        <MetricDimensionItem
                            key={fieldId}
                            fieldId={fieldId}
                            type="metric"
                            fieldsMap={fieldsMap}
                            showTablePrefix={showTablePrefix}
                            customMetric={customMetric}
                            onWriteBackCustomMetric={
                                customMetric ? handleWriteBack : undefined
                            }
                        />
                    );
                })}
                {metricQuery.dimensions.map((fieldId) => (
                    <MetricDimensionItem
                        key={fieldId}
                        fieldId={fieldId}
                        type="dimension"
                        fieldsMap={fieldsMap}
                        showTablePrefix={showTablePrefix}
                    />
                ))}
            </Flex>

            {projectUuid && writeBackModal.metric && (
                <SingleItemModalContent
                    handleClose={handleCloseModal}
                    item={writeBackModal.metric}
                    projectUuid={projectUuid}
                />
            )}
        </>
    );
};

export default AgentVisualizationMetricsAndDimensions;
