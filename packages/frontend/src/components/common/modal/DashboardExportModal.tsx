import { type Dashboard } from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    Input,
    MultiSelect,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine-8/core';
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
import Callout from '../Callout';
import MantineIcon from '../MantineIcon';
import MantineModal, { type MantineModalProps } from '../MantineModal';

type DashboardExportModalProps = Pick<
    MantineModalProps,
    'opened' | 'onClose'
> & {
    gridWidth: number;
    dashboard: Dashboard;
};

export const DashboardExportModal: FC<DashboardExportModalProps> = ({
    opened,
    onClose,
    gridWidth,
    dashboard,
}) => {
    const [exportType, setExportType] = useState<'image' | 'csv'>('image');
    const location = useLocation();

    // CSV export state
    const exportCsvDashboardMutation = useExportCsvDashboard();
    const dashboardFilters = useDashboardContext((c) => c.allFilters);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );

    // Image export state
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<
        typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined
    >(CUSTOM_WIDTH_OPTIONS[1].value);
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

    const handleCsvExport = useCallback(() => {
        exportCsvDashboardMutation.mutate({
            dashboard,
            filters: dashboardFilters,
            dateZoomGranularity: dateZoomGranularity,
        });
        onClose();
    }, [
        exportCsvDashboardMutation,
        dashboard,
        dashboardFilters,
        dateZoomGranularity,
        onClose,
    ]);

    const handleImageExport = useCallback(() => {
        if (previewChoice && previews[getPreviewKey(previewChoice)]) {
            window.open(previews[getPreviewKey(previewChoice)], '_blank');
            return;
        }

        const queryParams = new URLSearchParams(location.search);

        exportDashboardMutation.mutate({
            dashboard,
            gridWidth: undefined,
            queryFilters: `?${queryParams.toString()}`,
            selectedTabs:
                isDashboardTabsAvailable &&
                !allTabsSelected &&
                selectedTabs.length > 0
                    ? selectedTabs
                    : null,
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
                isDashboardTabsAvailable &&
                !allTabsSelected &&
                selectedTabs.length > 0
                    ? selectedTabs
                    : null,
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

    const renderActions = () => {
        if (exportType === 'csv') {
            return (
                <Tooltip
                    withinPortal
                    position="bottom"
                    label="Export results in table for all charts in a zip file"
                >
                    <Button
                        onClick={handleCsvExport}
                        leftSection={<MantineIcon icon={IconCsv} />}
                    >
                        Export CSV
                    </Button>
                </Tooltip>
            );
        }

        return (
            <Button
                loading={exportDashboardMutation.isLoading}
                onClick={handleImageExport}
                disabled={!hasTilesInSelectedTabs()}
                leftSection={
                    <MantineIcon
                        icon={previewChoice ? IconScreenshot : IconFileExport}
                    />
                }
            >
                Export dashboard
            </Button>
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Export dashboard"
            icon={IconLayoutDashboard}
            size="xl"
            actions={renderActions()}
            modalRootProps={{ yOffset: '3vh' }}
        >
            <Stack gap="md">
                <SegmentedControl
                    data={[
                        { label: 'Image', value: 'image' },
                        { label: '.csv', value: 'csv' },
                    ]}
                    w="min-content"
                    radius="md"
                    value={exportType}
                    onChange={(value) =>
                        setExportType(value as 'image' | 'csv')
                    }
                />

                {exportType === 'csv' && (
                    <>
                        {!!dateZoomGranularity && (
                            <Callout
                                title="Date zoom is enabled"
                                variant="info"
                            >
                                Your CSV export will include data for the
                                selected date zoom granularity.
                            </Callout>
                        )}
                    </>
                )}

                {exportType === 'image' && (
                    <Stack gap="xs">
                        {isDashboardTabsAvailable && (
                            <Stack gap="xs">
                                <Input.Label>
                                    <Group gap="xs">
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
                                            const firstTabUuid =
                                                dashboard?.tabs?.[0]?.uuid;
                                            setSelectedTabs(
                                                firstTabUuid
                                                    ? [firstTabUuid]
                                                    : [],
                                            );
                                        }
                                    }}
                                />
                                {!allTabsSelected && (
                                    <MultiSelect
                                        placeholder="Select tabs to include in the export"
                                        value={selectedTabs}
                                        data={(dashboard?.tabs || []).map(
                                            (tab) => ({
                                                value: tab.uuid,
                                                label: tab.name,
                                            }),
                                        )}
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
                )}
            </Stack>
        </MantineModal>
    );
};
