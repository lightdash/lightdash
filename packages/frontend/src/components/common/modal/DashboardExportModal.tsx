import { type Dashboard } from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Group,
    Input,
    Modal,
    MultiSelect,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import {
    IconCsv,
    IconFileExport,
    IconHelpCircle,
    IconLayoutDashboard,
    IconScreenshot,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useLocation } from 'react-router';
import { PreviewAndCustomizeScreenshot } from '../../../features/preview';
import { CUSTOM_WIDTH_OPTIONS } from '../../../features/scheduler/constants';
import {
    useExportCsvDashboard,
    useExportDashboard,
} from '../../../hooks/dashboard/useDashboard';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
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
            <Group position="right" spacing="lg">
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

    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 0;

    const [allTabsSelected, setAllTabsSelected] = useState(true);
    const [selectedTabs, setSelectedTabs] = useState<string[]>(
        dashboard?.tabs?.map((tab) => tab.uuid) || [],
    );

    // Check if the selected tabs have tiles so we can disable the export button if not
    const hasTilesInSelectedTabs = useCallback(() => {
        if (allTabsSelected) {
            return dashboard.tiles.length > 0;
        }
        return dashboard.tiles.some((tile) =>
            selectedTabs.includes(tile.tabUuid || ''),
        );
    }, [allTabsSelected, dashboard.tiles, selectedTabs]);

    // Helper function to create consistent cache keys
    const getPreviewKey = useCallback(
        (width: string) => {
            return `${width}-${selectedTabs.join('-')}`;
        },
        [selectedTabs],
    );

    // Get the current preview based on the key
    const currentPreview = previewChoice
        ? previews[getPreviewKey(previewChoice)]
        : undefined;

    const handleExportClick = useCallback(() => {
        if (previewChoice && previews[getPreviewKey(previewChoice)]) {
            return window.open(
                previews[getPreviewKey(previewChoice)],
                '_blank',
            );
        }

        const queryParams = new URLSearchParams(location.search);

        exportDashboardMutation.mutate({
            dashboard,
            gridWidth: undefined,
            queryFilters: `?${queryParams.toString()}`,
            selectedTabs:
                isDashboardTabsAvailable && !allTabsSelected
                    ? selectedTabs
                    : undefined,
        });
    }, [
        previewChoice,
        previews,
        getPreviewKey,
        exportDashboardMutation,
        location.search,
        dashboard,
        isDashboardTabsAvailable,
        allTabsSelected,
        selectedTabs,
    ]);

    const handlePreviewClick = useCallback(async () => {
        const queryParams = new URLSearchParams(location.search);

        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: `?${queryParams.toString()}`,
            isPreview: true,
            selectedTabs:
                isDashboardTabsAvailable && !allTabsSelected
                    ? selectedTabs
                    : undefined,
        });

        // Store the preview with the proper key
        if (previewChoice) {
            const key = getPreviewKey(previewChoice);
            setPreviews((prev) => ({
                ...prev,
                [key]: url,
            }));
        }
    }, [
        location.search,
        exportDashboardMutation,
        dashboard,
        previewChoice,
        isDashboardTabsAvailable,
        allTabsSelected,
        selectedTabs,
        getPreviewKey,
    ]);

    return (
        <Stack>
            <Stack spacing="xs" px="md">
                {isDashboardTabsAvailable && (
                    <Stack spacing="xs">
                        <Input.Label>
                            <Group spacing="xs">
                                Tabs
                                <Tooltip
                                    withinPortal={true}
                                    maw={400}
                                    variant="xs"
                                    multiline
                                    label="Select all tabs to include all tabs in the export. If you don't select this option, only selected tabs will be included."
                                >
                                    <MantineIcon
                                        icon={IconHelpCircle}
                                        size="md"
                                        display="inline"
                                        color="gray"
                                    />
                                </Tooltip>
                            </Group>
                        </Input.Label>
                        <Checkbox
                            size="sm"
                            label="Include all tabs"
                            labelPosition="right"
                            checked={allTabsSelected}
                            onChange={(e) => {
                                setAllTabsSelected(e.target.checked);
                                if (e.target.checked) {
                                    setSelectedTabs(
                                        dashboard?.tabs?.map(
                                            (tab) => tab.uuid,
                                        ) || [],
                                    );
                                } else {
                                    setSelectedTabs([
                                        dashboard?.tabs?.[0]?.uuid,
                                    ]);
                                }
                            }}
                        />
                        {!allTabsSelected && (
                            <MultiSelect
                                placeholder="Select tabs to include in the export"
                                value={selectedTabs}
                                data={(dashboard?.tabs || []).map((tab) => ({
                                    value: tab.uuid,
                                    label: tab.name,
                                }))}
                                clearButtonProps={{
                                    style: {
                                        display:
                                            selectedTabs.length > 1
                                                ? 'block'
                                                : 'none',
                                    },
                                }}
                                clearable={selectedTabs.length > 1}
                                searchable
                                onChange={setSelectedTabs}
                                required
                                error={
                                    !hasTilesInSelectedTabs()
                                        ? 'There are no tiles in the selected tab(s)'
                                        : undefined
                                }
                            />
                        )}
                    </Stack>
                )}

                <PreviewAndCustomizeScreenshot
                    containerWidth={gridWidth}
                    exportMutation={exportDashboardMutation}
                    previewChoice={previewChoice}
                    setPreviewChoice={setPreviewChoice}
                    onPreviewClick={handlePreviewClick}
                    currentPreview={currentPreview}
                    disabled={!hasTilesInSelectedTabs()}
                />
            </Stack>

            <Box
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[2]}`,
                    padding: theme.spacing.sm,
                    backgroundColor: theme.white,
                    position: 'sticky',
                    bottom: 0,
                    width: '100%',
                    zIndex: 10,
                })}
            >
                <Group position="right" spacing="lg">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Group spacing="xs">
                        <Button
                            loading={exportDashboardMutation.isLoading}
                            onClick={handleExportClick}
                            disabled={!hasTilesInSelectedTabs()}
                            leftIcon={
                                <MantineIcon
                                    icon={
                                        previewChoice
                                            ? IconScreenshot
                                            : IconFileExport
                                    }
                                />
                            }
                        >
                            Export dashboard
                        </Button>
                    </Group>
                </Group>
            </Box>
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
        <Modal.Root opened={opened} onClose={onClose} size="xl" yOffset="3vh">
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    maxWidth: '800px',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: theme.spacing.sm,
                    })}
                >
                    <Group spacing="xs">
                        <Paper p="xs" withBorder radius="sm">
                            <MantineIcon icon={IconLayoutDashboard} size="sm" />
                        </Paper>
                        <Text color="dark.7" fw={700} fz="md">
                            Export dashboard
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <SegmentedControl
                    ml="md"
                    mt="xs"
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
            </Modal.Content>
        </Modal.Root>
    );
};
