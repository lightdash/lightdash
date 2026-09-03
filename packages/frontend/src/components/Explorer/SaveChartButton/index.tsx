import { deepEqual, getItemId, getMetrics } from '@lightdash/common';
import { Button, Group, rgba, Text, Tooltip } from '@mantine/core';
import {
    IconCircleCheckFilled,
    IconDeviceFloppy,
    IconPlus,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
    useAmbientAiEnabled,
    useGenerateChartMetadata,
} from '../../../ee/features/ambientAi';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import {
    selectHasPaletteChanges,
    selectHasUnsavedChanges,
    selectHasVersionChanges,
    selectIsDataAppVizVersionReadyForSave,
    selectIsValidQuery,
    selectSavedChart,
    selectUnsavedChartVersion,
    selectUnsavedChartVersionForSave,
    selectUnsavedColorPaletteUuid,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useSavedMerge } from '../../../features/mergeQuery/hooks/useSavedMerge';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import {
    useAddVersionMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import {
    useIsModalHosted,
    useModalHostedChartSaved,
} from '../../../providers/Explorer/useIsModalHosted';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import ChartCreateModal from '../../common/modal/ChartCreateModal';

export type VerificationSavePrompt = 'confirm-keep' | 'warn-removal';

const SaveChartButton: FC<{
    disabled?: boolean;
    onSaveModalOpenChange?: (isOpen: boolean) => void;
    verificationSavePrompt?: VerificationSavePrompt;
}> = ({ disabled, onSaveModalOpenChange, verificationSavePrompt }) => {
    const isAmbientAiEnabled = useAmbientAiEnabled();
    const embed = useEmbed();
    const isEmbedded = embed.embedToken !== undefined;
    const isModalHosted = useIsModalHosted();
    const onModalHostChartSaved = useModalHostedChartSaved();
    // Both mean the Explorer is not the page, so saving must not navigate away.
    const suppressNavigation = isEmbedded || isModalHosted;
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
    // Merge state lives outside the explorer store, so it is attached at save
    // time rather than arriving with the chart version — and its changes are
    // tracked here too, or editing only the merge would leave Save inert.
    const { merge, isValid: isMergeValid } = useSavedMerge();
    const hasMergeChanges = useMemo(() => {
        const saved = savedChart?.merge ?? null;
        if (merge === null || saved === null) return merge !== saved;
        return !deepEqual(merge, saved);
    }, [merge, savedChart?.merge]);

    // Read isValidQuery from Redux
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const isDataAppVizVersionReadyForSave = useExplorerSelector(
        selectIsDataAppVizVersionReadyForSave,
    );
    const spaceUuid = useSearchParams('fromSpace');

    // For new charts, button is enabled when query is valid
    // For existing charts, button is enabled when there are unsaved changes
    const hasUnsavedChanges = savedChart
        ? hasUnsavedChangesInStore || hasMergeChanges
        : isValidQuery;

    const { missingRequiredParameters } = useExplorerQuery();
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isSaveAsModal, setIsSaveAsModal] = useState(false);
    const [isSaveVerificationModalOpen, setIsSaveVerificationModalOpen] =
        useState(false);
    // Track if user clicked save while metadata is still loading
    const [isPendingOpen, setIsPendingOpen] = useState(false);

    useEffect(() => {
        onSaveModalOpenChange?.(isQueryModalOpen);
    }, [isQueryModalOpen, onSaveModalOpenChange]);

    const openSaveAsModal = () => {
        setIsSaveAsModal(true);
        setIsQueryModalOpen(true);
    };

    const update = useAddVersionMutation({
        redirectOnSuccess: !suppressNavigation,
    });
    const updateMetadata = useUpdateMutation(
        savedChart?.dashboardUuid ?? undefined,
        savedChart?.uuid,
    );
    const stagedColorPaletteUuid = useExplorerSelector(
        selectUnsavedColorPaletteUuid,
    );
    const hasVersionChanges = useExplorerSelector(selectHasVersionChanges);
    const hasPaletteChanges = useExplorerSelector(selectHasPaletteChanges);
    const handleSavedQueryUpdate = (preserveVerification?: boolean) => {
        if (!savedChart?.uuid || !unsavedChartVersionForSave) return;
        const verificationUpdate =
            preserveVerification === undefined ? {} : { preserveVerification };

        if (hasPaletteChanges) {
            updateMetadata.mutate(
                {
                    colorPaletteUuid: stagedColorPaletteUuid,
                    ...verificationUpdate,
                },
                {
                    onSuccess: (data) => {
                        if (!hasVersionChanges && !hasMergeChanges) {
                            embed.onChartSaved?.(data, 'updated');
                            onModalHostChartSaved?.(data);
                        }
                    },
                },
            );
        }
        if (hasVersionChanges || hasMergeChanges) {
            update.mutate(
                {
                    uuid: savedChart.uuid,
                    payload: {
                        ...unsavedChartVersionForSave,
                        merge,
                        ...verificationUpdate,
                    },
                },
                {
                    // Lets a dashboard builder react to the update
                    // (e.g. close its chart editor modal)
                    onSuccess: (data) => {
                        embed.onChartSaved?.(data, 'updated');
                        onModalHostChartSaved?.(data);
                    },
                },
            );
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
        !isDataAppVizVersionReadyForSave ||
        foundCustomMetricWithDuplicateId ||
        !isMergeValid ||
        !!missingRequiredParameters?.length;

    const handleSaveChart = () => {
        if (savedChart) {
            if (verificationSavePrompt) {
                setIsSaveVerificationModalOpen(true);
                return;
            }
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
        disabled ||
        !unsavedChartVersion.tableName ||
        // Embeds may duplicate a chart as-is (there is no other way to copy
        // one there); the main app keeps requiring changes
        (!hasUnsavedChanges && !isEmbedded) ||
        !isDataAppVizVersionReadyForSave ||
        foundCustomMetricWithDuplicateId ||
        !isMergeValid ||
        !!missingRequiredParameters?.length;

    return (
        <>
            <Button.Group>
                <Tooltip
                    label={
                        !isMergeValid
                            ? 'Finish configuring the merge before saving.'
                            : 'A custom metric ID matches an existing table metric. Rename it to avoid conflicts.'
                    }
                    disabled={isMergeValid && !foundCustomMetricWithDuplicateId}
                    position={'bottom'}
                    maw={300}
                >
                    <Button
                        disabled={isDisabled}
                        variant="default"
                        size="xs"
                        loading={update.isLoading || isPendingOpen}
                        leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                        {...(isDisabled && {
                            'data-disabled': true,
                        })}
                        // Trigger metadata generation on mouse enter if available
                        onMouseEnter={() => {
                            if (savedChart) return;
                            if (suppressNavigation) return;
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
                    <Tooltip
                        label="Save as new chart"
                        position="bottom"
                        disabled={isSaveAsDisabled}
                    >
                        <Button
                            variant="default"
                            size="xs"
                            p="xs"
                            disabled={isSaveAsDisabled}
                            aria-label="Save as new chart"
                            style={{
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                            }}
                            data-testid="SaveChartButton/SaveAsButton"
                            onClick={openSaveAsModal}
                        >
                            <MantineIcon icon={IconPlus} size="sm" />
                        </Button>
                    </Tooltip>
                )}
            </Button.Group>

            {unsavedChartVersionForSave && (
                <ChartCreateModal
                    opened={isQueryModalOpen}
                    savedData={{ ...unsavedChartVersionForSave, merge }}
                    colorPaletteUuid={stagedColorPaletteUuid}
                    onClose={() => {
                        setIsQueryModalOpen(false);
                        setIsSaveAsModal(false);
                    }}
                    onConfirm={(saved) => {
                        setIsQueryModalOpen(false);
                        setIsSaveAsModal(false);
                        embed.onChartSaved?.(saved, 'created');
                        onModalHostChartSaved?.(saved);
                    }}
                    defaultSpaceUuid={spaceUuid ?? undefined}
                    chartMetadata={generatedMetadata ?? undefined}
                    forceSpaceOrDashboardChoice={isSaveAsModal}
                    isSaveAs={isSaveAsModal}
                    redirectOnSuccess={!suppressNavigation}
                    showViewChartAction={!suppressNavigation}
                    forcedSpaceUuid={
                        isEmbedded ? embed.writeActions?.spaceUuid : undefined
                    }
                />
            )}

            <MantineModal
                opened={isSaveVerificationModalOpen}
                onClose={() => setIsSaveVerificationModalOpen(false)}
                title="Save verified chart"
            >
                {verificationSavePrompt === 'warn-removal' ? (
                    <>
                        <Text mb="md">
                            This chart is verified. Saving your changes will
                            remove its verified status until someone verifies it
                            again.
                        </Text>
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                onClick={() =>
                                    setIsSaveVerificationModalOpen(false)
                                }
                            >
                                Cancel
                            </Button>
                            <Button
                                loading={
                                    update.isLoading || updateMetadata.isLoading
                                }
                                onClick={() => {
                                    setIsSaveVerificationModalOpen(false);
                                    handleSavedQueryUpdate(false);
                                }}
                            >
                                Save anyway
                            </Button>
                        </Group>
                    </>
                ) : (
                    <>
                        <Text mb="md">
                            Keep this chart verified after saving?
                        </Text>
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                loading={
                                    update.isLoading || updateMetadata.isLoading
                                }
                                onClick={() => {
                                    setIsSaveVerificationModalOpen(false);
                                    handleSavedQueryUpdate(false);
                                }}
                            >
                                Save
                            </Button>
                            <Button
                                color="green.7"
                                leftSection={
                                    <IconCircleCheckFilled size={16} />
                                }
                                loading={
                                    update.isLoading || updateMetadata.isLoading
                                }
                                onClick={() => {
                                    setIsSaveVerificationModalOpen(false);
                                    handleSavedQueryUpdate(true);
                                }}
                            >
                                Save & verify
                            </Button>
                        </Group>
                    </>
                )}
            </MantineModal>
        </>
    );
};

export default SaveChartButton;
