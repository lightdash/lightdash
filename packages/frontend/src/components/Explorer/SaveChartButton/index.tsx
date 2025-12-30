import { getItemId, getMetrics } from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    useAmbientAiEnabled,
    useGenerateChartMetadata,
} from '../../../ee/features/ambientAi';
import {
    selectHasUnsavedChanges,
    selectIsValidQuery,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import MantineIcon from '../../common/MantineIcon';
import ChartCreateModal from '../../common/modal/ChartCreateModal';

const SaveChartButton: FC<{ isExplorer?: boolean; disabled?: boolean }> = ({
    isExplorer,
    disabled,
}) => {
    const isAmbientAiEnabled = useAmbientAiEnabled();
    const projectUuid = useProjectUuid();
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
    // Track if user clicked save while metadata is still loading
    const [isPendingOpen, setIsPendingOpen] = useState(false);

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

    // Open modal when metadata generation completes (if user clicked while loading)
    const handleMetadataComplete = useCallback(() => {
        setIsPendingOpen((pending) => {
            if (pending) {
                setIsQueryModalOpen(true);
            }
            return false;
        });
    }, []);

    // AI metadata generation - triggered on hover for new charts
    const {
        generatedMetadata,
        trigger: triggerMetadataGeneration,
        isLoading: isGeneratingMetadata,
    } = useGenerateChartMetadata({
        projectUuid,
        explore,
        unsavedChartVersion,
        onComplete: handleMetadataComplete,
    });

    const isDisabled =
        disabled ||
        !unsavedChartVersion.tableName ||
        !hasUnsavedChanges ||
        foundCustomMetricWithDuplicateId ||
        !!missingRequiredParameters?.length;

    const handleSaveChart = () => {
        if (savedChart) {
            handleSavedQueryUpdate();
        } else if (isGeneratingMetadata) {
            // Metadata still loading - wait for it to complete
            setIsPendingOpen(true);
        } else {
            // Metadata ready or not triggered - open immediately
            setIsQueryModalOpen(true);
        }
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
                    loading={update.isLoading || isPendingOpen}
                    leftSection={
                        isExplorer ? (
                            <MantineIcon icon={IconDeviceFloppy} />
                        ) : undefined
                    }
                    {...(isDisabled && {
                        'data-disabled': true,
                    })}
                    // Trigger metadata generation on mouse enter if available
                    onMouseEnter={() => {
                        if (savedChart) return;
                        if (!isAmbientAiEnabled) return;
                        triggerMetadataGeneration();
                    }}
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
                    opened={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => {
                        setIsQueryModalOpen(false);
                    }}
                    onConfirm={() => {
                        setIsQueryModalOpen(false);
                    }}
                    defaultSpaceUuid={spaceUuid ?? undefined}
                    chartMetadata={generatedMetadata ?? undefined}
                />
            )}
        </>
    );
};

export default SaveChartButton;
