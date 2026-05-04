import { getItemId, getMetrics } from '@lightdash/common';
import { Button, Menu, rgba, Tooltip } from '@mantine-8/core';
import {
    IconChevronDown,
    IconCirclePlus,
    IconDeviceFloppy,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
    useAmbientAiEnabled,
    useGenerateChartMetadata,
} from '../../../ee/features/ambientAi';
import {
    selectHasUnsavedChanges,
    selectIsValidQuery,
    selectSavedChart,
    selectUnsavedChartVersion,
    selectUnsavedChartVersionForSave,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import MantineIcon from '../../common/MantineIcon';
import ChartCreateModal from '../../common/modal/ChartCreateModal';

const SaveChartButton: FC<{
    isExplorer?: boolean;
    disabled?: boolean;
    onSaveModalOpenChange?: (isOpen: boolean) => void;
}> = ({ isExplorer, disabled, onSaveModalOpenChange }) => {
    const isAmbientAiEnabled = useAmbientAiEnabled();
    const projectUuid = useProjectUuid();
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    // For saving: enriched with map extent (only subscribes here to avoid re-renders elsewhere)
    const unsavedChartVersionForSave = useExplorerSelector(
        selectUnsavedChartVersionForSave,
    );

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
    const [forceSpaceOrDashboardChoice, setForceSpaceOrDashboardChoice] =
        useState(false);
    // Track if user clicked save while metadata is still loading
    const [isPendingOpen, setIsPendingOpen] = useState(false);

    const { getEditingDashboardInfo } = useDashboardStorage();
    const editingDashboardInfo = getEditingDashboardInfo();
    const dashboardName = editingDashboardInfo.dashboardUuid
        ? editingDashboardInfo.name
        : null;

    useEffect(() => {
        onSaveModalOpenChange?.(isQueryModalOpen);
    }, [isQueryModalOpen, onSaveModalOpenChange]);

    const openSaveAsModal = (chooseLocation: boolean) => {
        setForceSpaceOrDashboardChoice(chooseLocation);
        setIsQueryModalOpen(true);
    };

    const update = useAddVersionMutation();
    const handleSavedQueryUpdate = () => {
        if (savedChart?.uuid && unsavedChartVersionForSave) {
            update.mutate({
                uuid: savedChart.uuid,
                payload: unsavedChartVersionForSave,
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

    const showSaveAsMenu = !!savedChart;
    const isSaveAsDisabled =
        !unsavedChartVersion.tableName ||
        !hasUnsavedChanges ||
        foundCustomMetricWithDuplicateId ||
        !!missingRequiredParameters?.length;

    return (
        <>
            <Button.Group>
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
                        style={(theme) => ({
                            '&[data-disabled="true"]': {
                                pointerEvents: 'all',
                            },
                            ...(showSaveAsMenu && {
                                borderRight: `1px solid ${rgba(
                                    theme.colors.dark[3],
                                    0.4,
                                )}`,
                                borderTopRightRadius: 0,
                                borderBottomRightRadius: 0,
                            }),
                        })}
                        onClick={handleSaveChart}
                    >
                        {savedChart ? 'Save changes' : 'Save chart'}
                    </Button>
                </Tooltip>

                {showSaveAsMenu && (
                    <Menu
                        position="bottom-end"
                        withArrow
                        withinPortal
                        shadow="md"
                        offset={2}
                        arrowOffset={10}
                    >
                        <Menu.Target>
                            <Button
                                variant={isExplorer ? 'default' : undefined}
                                color={isExplorer ? 'blue' : 'green.7'}
                                size="xs"
                                p="xs"
                                disabled={isSaveAsDisabled}
                                aria-label="More save options"
                                style={{
                                    borderTopLeftRadius: 0,
                                    borderBottomLeftRadius: 0,
                                }}
                                data-testid="SaveChartButton/SaveAsMenu"
                            >
                                <MantineIcon icon={IconChevronDown} size="sm" />
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {dashboardName ? (
                                <>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconCirclePlus}
                                            />
                                        }
                                        disabled={isSaveAsDisabled}
                                        onClick={() => openSaveAsModal(false)}
                                    >
                                        {`Save as new chart in "${dashboardName}"`}
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconCirclePlus}
                                            />
                                        }
                                        disabled={isSaveAsDisabled}
                                        onClick={() => openSaveAsModal(true)}
                                    >
                                        Save as new chart and choose location
                                    </Menu.Item>
                                </>
                            ) : (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconCirclePlus} />
                                    }
                                    disabled={isSaveAsDisabled}
                                    onClick={() => openSaveAsModal(false)}
                                >
                                    Save as new chart
                                </Menu.Item>
                            )}
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Button.Group>

            {unsavedChartVersionForSave && (
                <ChartCreateModal
                    opened={isQueryModalOpen}
                    savedData={unsavedChartVersionForSave}
                    onClose={() => {
                        setIsQueryModalOpen(false);
                        setForceSpaceOrDashboardChoice(false);
                    }}
                    onConfirm={() => {
                        setIsQueryModalOpen(false);
                        setForceSpaceOrDashboardChoice(false);
                    }}
                    defaultSpaceUuid={spaceUuid ?? undefined}
                    chartMetadata={generatedMetadata ?? undefined}
                    forceSpaceOrDashboardChoice={forceSpaceOrDashboardChoice}
                />
            )}
        </>
    );
};

export default SaveChartButton;
