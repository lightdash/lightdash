import { ExploreType, isMetric, type Metric } from '@lightdash/common';
import { Group, Modal, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type PropsWithChildren } from 'react';
import {
    explorerActions,
    selectItemDetailModal,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../features/explorer/store';
import useMetricDefinition from '../../../../features/metricFlow/hooks/useMetricDefinition';
import useMetricLineage from '../../../../features/metricFlow/hooks/useMetricLineage';
import { useExplore } from '../../../../hooks/useExplore';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { getFieldColor } from '../../../../utils/fieldColors';
import FieldIcon from '../../../common/Filters/FieldIcon';
import MantineIcon from '../../../common/MantineIcon';
import MetricFlowMetricDetails from '../../MetricFlowMetricDetails';
import { ItemDetailMarkdown } from './ItemDetailPreview';

/**
 * Provider for a shared modal to display details about tree items
 */
export const ItemDetailProvider: FC<PropsWithChildren<{}>> = ({ children }) => {
    const dispatch = useExplorerDispatch();
    const itemDetail = useExplorerSelector(selectItemDetailModal);
    const tableName = useExplorerSelector(selectTableName);
    const { data: explore } = useExplore(tableName, {
        refetchOnMount: false,
    });
    const projectUuid = useProjectUuid();

    const isSemanticLayerMetric = useMemo(() => {
        return (
            itemDetail.itemType === 'field' &&
            !!itemDetail.fieldItem &&
            isMetric(itemDetail.fieldItem) &&
            explore?.type === ExploreType.SEMANTIC_LAYER
        );
    }, [itemDetail.itemType, itemDetail.fieldItem, explore?.type]);

    const metricName = isSemanticLayerMetric
        ? itemDetail.fieldItem?.name
        : undefined;
    const canLoadMetricDetails =
        itemDetail.isOpen && !!projectUuid && !!metricName;

    const { data: metricLineage, isLoading: isLineageLoading } =
        useMetricLineage(projectUuid, metricName, {
            enabled: canLoadMetricDetails && isSemanticLayerMetric,
        });
    const { data: metricDefinition, isLoading: isDefinitionLoading } =
        useMetricDefinition(projectUuid, metricName, {
            enabled: canLoadMetricDetails && isSemanticLayerMetric,
        });

    const metricDefinitionData =
        metricLineage?.metricDefinition ?? metricDefinition;
    const metricLineageData = metricLineage?.lineage;
    const isMetricDetailsLoading = isLineageLoading || isDefinitionLoading;

    const close = useCallback(() => {
        dispatch(explorerActions.closeItemDetail());
    }, [dispatch]);

    const renderHeader = useCallback(() => {
        if (!itemDetail.itemType || !itemDetail.label) return null;

        switch (itemDetail.itemType) {
            case 'field':
                return (
                    <Group>
                        {itemDetail.fieldItem && (
                            <FieldIcon
                                item={itemDetail.fieldItem}
                                color={getFieldColor(itemDetail.fieldItem)}
                                size="md"
                            />
                        )}
                        <Text size="md">{itemDetail.label}</Text>
                    </Group>
                );
            case 'table':
                return (
                    <Group spacing="sm">
                        <MantineIcon
                            icon={IconTable}
                            size="lg"
                            color="ldGray.7"
                        />
                        <Text size="md">{itemDetail.label}</Text>
                    </Group>
                );
            case 'group':
                return (
                    <Group>
                        <Text size="md">{itemDetail.label}</Text>
                    </Group>
                );
            default:
                return null;
        }
    }, [itemDetail.itemType, itemDetail.label, itemDetail.fieldItem]);

    const renderDetail = useCallback(() => {
        if (isSemanticLayerMetric && itemDetail.fieldItem && explore) {
            return (
                <MetricFlowMetricDetails
                    metric={itemDetail.fieldItem as Metric}
                    explore={explore}
                    definition={metricDefinitionData}
                    lineage={metricLineageData}
                    description={itemDetail.description}
                    isLoading={isMetricDetailsLoading}
                />
            );
        }
        if (itemDetail.description) {
            return <ItemDetailMarkdown source={itemDetail.description} />;
        }
        return <Text color="gray">No description available.</Text>;
    }, [
        isSemanticLayerMetric,
        itemDetail.fieldItem,
        itemDetail.description,
        explore,
        metricDefinitionData,
        metricLineageData,
        isMetricDetailsLoading,
    ]);

    return (
        <>
            {itemDetail.isOpen && (
                <Modal
                    p="xl"
                    size="95vw"
                    opened={itemDetail.isOpen}
                    onClose={close}
                    title={renderHeader()}
                    styles={{
                        content: {
                            width: '95vw',
                            maxWidth: 1440,
                        },
                    }}
                >
                    {renderDetail()}
                </Modal>
            )}

            {children}
        </>
    );
};
