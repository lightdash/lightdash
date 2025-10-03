import {
    deepEqual,
    getItemId,
    getMetrics,
    removeEmptyProperties,
} from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    selectColumnOrder,
    selectMetricQuery,
    selectParameters,
    selectPivotConfig,
    selectTableName,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { cleanConfig } from '../../../providers/Explorer/utils';
import MantineIcon from '../../common/MantineIcon';
import ChartCreateModal from '../../common/modal/ChartCreateModal';

const SaveChartButton: FC<{ isExplorer?: boolean }> = ({ isExplorer }) => {
    // Read migrated state from Redux
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const columnOrder = useExplorerSelector(selectColumnOrder);
    const parameters = useExplorerSelector(selectParameters);
    const pivotConfig = useExplorerSelector(selectPivotConfig);

    // Read chartConfig from Context (not migrated yet)
    const chartConfig = useExplorerContext(
        (context) => context.state.unsavedChartVersion.chartConfig,
    );
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    // Build unsavedChartVersion from Redux + Context
    const unsavedChartVersion = useMemo(
        () => ({
            tableName,
            metricQuery,
            tableConfig: { columnOrder },
            chartConfig,
            pivotConfig,
            parameters,
        }),
        [
            tableName,
            metricQuery,
            columnOrder,
            chartConfig,
            pivotConfig,
            parameters,
        ],
    );

    // Calculate hasUnsavedChanges
    const hasUnsavedChanges = useMemo<boolean>(() => {
        if (savedChart) {
            return !deepEqual(
                removeEmptyProperties({
                    tableName: savedChart.tableName,
                    chartConfig: cleanConfig(savedChart.chartConfig),
                    metricQuery: savedChart.metricQuery,
                    tableConfig: savedChart.tableConfig,
                    pivotConfig: savedChart.pivotConfig,
                    parameters: savedChart.parameters,
                }),
                removeEmptyProperties({
                    tableName: unsavedChartVersion.tableName,
                    chartConfig: cleanConfig(unsavedChartVersion.chartConfig),
                    metricQuery: unsavedChartVersion.metricQuery,
                    tableConfig: unsavedChartVersion.tableConfig,
                    pivotConfig: unsavedChartVersion.pivotConfig,
                    parameters: unsavedChartVersion.parameters,
                }),
            );
        }
        // If no saved chart, has changes if there's a valid query
        return (
            !!tableName &&
            metricQuery.dimensions.length + metricQuery.metrics.length > 0
        );
    }, [unsavedChartVersion, savedChart, tableName, metricQuery]);

    const spaceUuid = useSearchParams('fromSpace');

    const { missingRequiredParameters } = useExplorerQuery();

    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);

    const update = useAddVersionMutation();
    const handleSavedQueryUpdate = () => {
        if (savedChart?.uuid && unsavedChartVersion) {
            update.mutate({
                uuid: savedChart.uuid,
                payload: unsavedChartVersion,
            });
        }
    };
    const { data: explore } = useExplore(unsavedChartVersion.tableName);
    const foundCustomMetricWithDuplicateId = useMemo<boolean>(() => {
        if (!explore || !unsavedChartVersion.metricQuery.additionalMetrics)
            return false;
        const metricIds = getMetrics(explore).map(getItemId);
        return unsavedChartVersion.metricQuery.additionalMetrics.some(
            (metric) => metricIds.includes(getItemId(metric)),
        );
    }, [explore, unsavedChartVersion.metricQuery.additionalMetrics]);

    const isDisabled =
        !unsavedChartVersion.tableName ||
        !hasUnsavedChanges ||
        foundCustomMetricWithDuplicateId ||
        !!missingRequiredParameters?.length;

    const handleSaveChart = () => {
        return savedChart
            ? handleSavedQueryUpdate()
            : setIsQueryModalOpen(true);
    };

    return (
        <>
            <Tooltip
                label={
                    'A custom metric ID matches an existing table metric. Rename it to avoid conflicts.'
                }
                disabled={!foundCustomMetricWithDuplicateId}
                withinPortal
                multiline
                position={'bottom'}
                maw={300}
            >
                <Button
                    disabled={isDisabled}
                    variant={isExplorer ? 'default' : undefined}
                    color={isExplorer ? 'blue' : 'green.7'}
                    size="xs"
                    loading={update.isLoading}
                    leftSection={
                        isExplorer ? (
                            <MantineIcon icon={IconDeviceFloppy} />
                        ) : undefined
                    }
                    {...(isDisabled && {
                        'data-disabled': true,
                    })}
                    style={{
                        '&[data-disabled="true"]': {
                            pointerEvents: 'all',
                        },
                    }}
                    onClick={handleSaveChart}
                >
                    {savedChart ? 'Save changes' : 'Save chart'}
                </Button>
            </Tooltip>

            {unsavedChartVersion && (
                <ChartCreateModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsQueryModalOpen(false)}
                    onConfirm={() => setIsQueryModalOpen(false)}
                    defaultSpaceUuid={spaceUuid ?? undefined}
                />
            )}
        </>
    );
};

export default SaveChartButton;
