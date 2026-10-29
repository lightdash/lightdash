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
} from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import FieldIcon from '../../../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ItemDetailPreview } from '../../../../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';
import { SingleItemModalContent } from '../../../../../components/Explorer/WriteBackModal';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { getFieldColors } from '../../../../../utils/fieldColors';
import classes from './AgentVisualizationMetricsAndDimensions.module.css';

/** Field description and metric SQL on hover, as in the classic chart artifacts. */
export const FieldDetailHoverCard: FC<{
    field: ItemsMap[string] | AdditionalMetric | undefined;
    customMetric?: AdditionalMetric;
    disabled?: boolean;
    children: ReactNode;
}> = ({ field, customMetric, disabled = false, children }) => {
    const description = field && isField(field) ? field.description : undefined;
    const metricInfo = customMetric
        ? {
              type: customMetric.type,
              sql: customMetric.sql,
              compiledSql: customMetric.sql,
              name: customMetric.name,
              filters: customMetric.filters,
          }
        : field && isCompiledMetric(field)
          ? {
                type: field.type,
                sql: field.sql,
                compiledSql: field.compiledSql,
                filters: field.filters,
                table: field.table,
                name: field.name,
            }
          : undefined;

    return (
        <HoverCard
            openDelay={300}
            keepMounted={false}
            withArrow
            disabled={(!description && !metricInfo) || disabled}
            position="top"
            offset={10}
        >
            <HoverCard.Target>{children}</HoverCard.Target>
            <HoverCard.Dropdown
                p="xs"
                miw={300}
                mah={400}
                maw={400}
                className={classes.hoverDropdown}
                onClick={(e) => e.stopPropagation()}
            >
                <ItemDetailPreview
                    onViewDescription={() => {}}
                    description={description}
                    metricInfo={metricInfo}
                />
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

const MetricDimensionItem: FC<{
    fieldId: string;
    fieldsMap: ItemsMap;
    showTablePrefix: boolean;
    customMetric?: AdditionalMetric;
    onWriteBackCustomMetric?: (metric: AdditionalMetric) => void;
}> = ({
    fieldId,
    fieldsMap,
    showTablePrefix,
    customMetric,
    onWriteBackCustomMetric,
}) => {
    const projectUuid = useProjectUuid();
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

    const itemColors = getFieldColors(field);

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
        <FieldDetailHoverCard
            field={field}
            customMetric={customMetric}
            disabled={isCodeIconHovered}
        >
            <Button
                size="xs"
                variant="default"
                className={classes.itemButton}
                bg={itemColors.bg}
                classNames={{
                    inner: classes.itemButtonInner,
                    label: classes.itemButtonLabel,
                }}
                bd="none"
                rightSection={
                    isCustomMetric &&
                    onWriteBackCustomMetric && (
                        <Tooltip
                            openDelay={200}
                            position="top"
                            label="Write back to project"
                            offset={5}
                        >
                            <ActionIcon
                                variant="light"
                                size="xs"
                                color="grape.7"
                                onClick={handleWriteBack}
                                onMouseEnter={() => setIsCodeIconHovered(true)}
                                onMouseLeave={() => setIsCodeIconHovered(false)}
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
                    <FieldIcon
                        item={field}
                        color={itemColors.color}
                        size="sm"
                    />
                    <Box className={classes.itemText}>
                        <Text fz="xs" truncate>
                            {displayName}
                        </Text>
                    </Box>
                </Flex>
            </Button>
        </FieldDetailHoverCard>
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
    const projectUuid = useProjectUuid();
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
