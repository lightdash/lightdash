import { getItemId, getMetrics } from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    selectHasUnsavedChanges,
    selectIsValidQuery,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import MantineIcon from '../../common/MantineIcon';
import ChartCreateModal from '../../common/modal/ChartCreateModal';

const SaveChartButton: FC<{ isExplorer?: boolean; disabled?: boolean }> = ({
    isExplorer,
    disabled,
}) => {
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    const savedChart = useExplorerSelector(selectSavedChart);

    const hasUnsavedChangesInStore = useExplorerSelector(
        selectHasUnsavedChanges,
    );

    // Read isValidQuery from Redux
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const spaceUuid = useSearchParams('fromSpace');

    // For new charts, button is enabled when query is valid
    // For existing charts, button is enabled when there are unsaved changes
    const hasUnsavedChanges = savedChart
        ? hasUnsavedChangesInStore
        : isValidQuery;

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
        disabled ||
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
