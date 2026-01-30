import { type CreateSavedChartVersion, type Explore } from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import ChartCreateModal from '../../../../components/common/modal/ChartCreateModal';
import {
    useAmbientAiEnabled,
    useGenerateChartMetadata,
} from '../../../../ee/features/ambientAi';
import { DEFAULT_EMPTY_EXPLORE_CONFIG } from '../../../../hooks/useExplorerRoute';

type Props = {
    projectUuid: string | undefined;
    unsavedChartVersion: CreateSavedChartVersion | undefined;
    explore: Explore | undefined;
    hasData: boolean;
    canSave: boolean;
};

export const SaveChartButton: FC<Props> = ({
    projectUuid,
    unsavedChartVersion,
    explore,
    hasData,
    canSave,
}) => {
    const isAmbientAiEnabled = useAmbientAiEnabled();
    const [isSaveChartModalOpen, setIsSaveChartModalOpen] = useState(false);
    const [isPendingOpen, setIsPendingOpen] = useState(false);

    const handleMetadataComplete = useCallback(() => {
        setIsPendingOpen((pending) => {
            if (pending) {
                setIsSaveChartModalOpen(true);
            }
            return false;
        });
    }, []);

    const {
        generatedMetadata,
        trigger: triggerMetadataGeneration,
        isLoading: isGeneratingMetadata,
    } = useGenerateChartMetadata({
        projectUuid,
        explore,
        unsavedChartVersion:
            unsavedChartVersion ?? DEFAULT_EMPTY_EXPLORE_CONFIG,
        onComplete: handleMetadataComplete,
    });

    const handleSaveChartClick = useCallback(() => {
        if (isGeneratingMetadata) {
            // Metadata still loading - wait for it to complete
            setIsPendingOpen(true);
        } else {
            // Metadata ready or not triggered - open immediately
            setIsSaveChartModalOpen(true);
        }
    }, [isGeneratingMetadata]);

    const canSaveChart = Boolean(canSave && hasData && unsavedChartVersion);

    return (
        <>
            <Tooltip
                label="Save this chart to a space or dashboard"
                position="bottom"
                disabled={!canSaveChart}
            >
                <Button
                    variant="default"
                    size="xs"
                    radius="md"
                    leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                    disabled={!canSaveChart}
                    loading={isPendingOpen}
                    onClick={handleSaveChartClick}
                    onMouseEnter={() => {
                        if (!isAmbientAiEnabled) return;
                        if (!canSaveChart) return;
                        triggerMetadataGeneration();
                    }}
                >
                    Save chart
                </Button>
            </Tooltip>

            {unsavedChartVersion && (
                <ChartCreateModal
                    opened={isSaveChartModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsSaveChartModalOpen(false)}
                    onConfirm={() => setIsSaveChartModalOpen(false)}
                    chartMetadata={generatedMetadata ?? undefined}
                />
            )}
        </>
    );
};
