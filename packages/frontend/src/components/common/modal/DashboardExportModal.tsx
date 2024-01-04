import { Dashboard } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    Title,
} from '@mantine/core';
import { IconEyeCog, IconFileExport } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PreviewAndCustomizeScreenshot } from '../../../features/preview';
import { CUSTOM_WIDTH_OPTIONS } from '../../../features/scheduler/constants';
import { useExportDashboard } from '../../../hooks/dashboard/useDashboard';
import MantineIcon from '../MantineIcon';

type Props = {
    gridWidth: number;
    dashboard: Dashboard;
};

export const DashboardExportModal: FC<Props & ModalProps> = ({
    opened,
    onClose,
    gridWidth,
    dashboard,
}) => {
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<
        typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined
    >(CUSTOM_WIDTH_OPTIONS[1].value);
    const location = useLocation();
    const exportDashboardMutation = useExportDashboard();

    const handleExportClick = useCallback(() => {
        if (previewChoice && previews[previewChoice])
            return window.open(exportDashboardMutation.data, '_blank');

        exportDashboardMutation.mutate({
            dashboard,
            gridWidth: undefined,
            queryFilters: location.search,
        });
    }, [
        dashboard,
        exportDashboardMutation,
        location.search,
        previewChoice,
        previews,
    ]);

    const handlePreviewClick = useCallback(async () => {
        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: location.search,
            isPreview: true,
        });
        setPreviews((prev) => ({
            ...prev,
            ...(previewChoice ? { [previewChoice]: url } : {}),
        }));
    }, [
        dashboard,
        exportDashboardMutation,
        location.search,
        previewChoice,
        setPreviews,
    ]);

    return (
        <>
            <Modal
                size="xl"
                yOffset="3vh"
                opened={opened}
                onClose={onClose}
                title={<Title order={5}>Export dashboard</Title>}
                styles={{
                    body: {
                        padding: 0,
                    },
                }}
            >
                <Stack>
                    <Box p="md">
                        <PreviewAndCustomizeScreenshot
                            containerWidth={gridWidth}
                            exportMutation={exportDashboardMutation}
                            previews={previews}
                            setPreviews={setPreviews}
                            previewChoice={previewChoice}
                            setPreviewChoice={setPreviewChoice}
                            onPreviewClick={handlePreviewClick}
                        />
                    </Box>

                    <Group position="right" pb="md" px="md" spacing="lg">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>

                        <Group spacing="xs">
                            <Button
                                loading={exportDashboardMutation.isLoading}
                                onClick={handleExportClick}
                                leftIcon={
                                    <MantineIcon
                                        icon={
                                            previewChoice
                                                ? IconEyeCog
                                                : IconFileExport
                                        }
                                    />
                                }
                            >
                                Export dashboard
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};
