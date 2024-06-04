import { type Dashboard } from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Group,
    Modal,
    SegmentedControl,
    Stack,
    Title,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { IconCsv, IconEyeCog, IconFileExport } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useLocation } from 'react-router-dom';
import { PreviewAndCustomizeScreenshot } from '../../../features/preview';
import { CUSTOM_WIDTH_OPTIONS } from '../../../features/scheduler/constants';
import {
    useExportCsvDashboard,
    useExportDashboard,
} from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import MantineIcon from '../MantineIcon';

type Props = {
    gridWidth: number;
    dashboard: Dashboard;
};

type CsvExportProps = {
    dashboard: Dashboard;
};

const CsvExport: FC<CsvExportProps & Pick<ModalProps, 'onClose'>> = ({
    dashboard,
    onClose,
}) => {
    const exportCsvDashboardMutation = useExportCsvDashboard();
    const dashboardFilters = useDashboardContext((c) => c.allFilters);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    return (
        <Stack p="md">
            {!!dateZoomGranularity && (
                <Alert title="Date zoom is enabled" color="blue" mb="md">
                    Your CSV export will include data for the selected date zoom
                    granularity.
                </Alert>
            )}
            <Group position="right" pb="md" px="md" spacing="lg">
                <Button variant="outline" onClick={onClose}>
                    Cancel
                </Button>

                <Group spacing="xs">
                    <Tooltip
                        withinPortal
                        position="bottom"
                        label="Export results in table for all charts in a zip file"
                    >
                        <Button
                            onClick={() => {
                                exportCsvDashboardMutation.mutate({
                                    dashboard,
                                    filters: dashboardFilters,
                                    dateZoomGranularity: dateZoomGranularity,
                                });
                                onClose();
                            }}
                            leftIcon={<MantineIcon icon={IconCsv} />}
                        >
                            Export CSV
                        </Button>
                    </Tooltip>
                </Group>
            </Group>
        </Stack>
    );
};

const ImageExport: FC<Props & Pick<ModalProps, 'onClose'>> = ({
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
                                    previewChoice ? IconEyeCog : IconFileExport
                                }
                            />
                        }
                    >
                        Export dashboard
                    </Button>
                </Group>
            </Group>
        </Stack>
    );
};

export const DashboardExportModal: FC<Props & ModalProps> = ({
    opened,
    onClose,
    gridWidth,
    dashboard,
}) => {
    const [exportType, setExportType] = useState<string>('image');

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
                <SegmentedControl
                    ml="md"
                    data={[
                        {
                            label: 'Image',
                            value: 'image',
                        },
                        {
                            label: '.csv',
                            value: 'csv',
                        },
                    ]}
                    w="min-content"
                    mb="xs"
                    defaultValue="image"
                    onChange={setExportType}
                />
                {exportType === 'csv' && (
                    <CsvExport dashboard={dashboard} onClose={onClose} />
                )}

                {exportType === 'image' && (
                    <ImageExport
                        dashboard={dashboard}
                        onClose={onClose}
                        gridWidth={gridWidth}
                    />
                )}
            </Modal>
        </>
    );
};
