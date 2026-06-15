import {
    SchedulerFormat,
    type Dashboard,
    type SchedulerCsvOptions,
} from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    Input,
    MultiSelect,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCsv,
    IconFileExport,
    IconFileTypeXls,
    IconHelpCircle,
    IconLayoutDashboard,
    IconScreenshot,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useLocation } from 'react-router';
import { PreviewAndCustomizeScreenshot } from '../../../features/preview';
import { CsvFormattingOptions } from '../../../features/scheduler/components/CsvFormattingOptions';
import { Limit, Values } from '../../../features/scheduler/components/types';
import { CUSTOM_WIDTH_OPTIONS } from '../../../features/scheduler/constants';
import {
    useExportDashboardContent,
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
    const [exportType, setExportType] = useState<
        SchedulerFormat.IMAGE | SchedulerFormat.CSV | SchedulerFormat.XLSX
    >(SchedulerFormat.IMAGE);
    const location = useLocation();
    const exportDashboardContentMutation = useExportDashboardContent();
    const dashboardFilters = useDashboardContext((c) => c.allFilters);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );

    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<
        (typeof CUSTOM_WIDTH_OPTIONS)[number]['value'] | undefined
    >(CUSTOM_WIDTH_OPTIONS[1].value);
    const exportDashboardMutation = useExportDashboard();

    const [formatted, setFormatted] = useState<Values>(Values.FORMATTED);
    const [limit, setLimit] = useState<Limit>(Limit.TABLE);
    const [customLimit, setCustomLimit] = useState(1);
    const [exportPivotedData, setExportPivotedData] = useState(true);
    const [xlsxFileLayout, setXlsxFileLayout] =
        useState<NonNullable<SchedulerCsvOptions['xlsxFileLayout']>>('zip');
    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 0;
    const [allTabsSelected, setAllTabsSelected] = useState(true);
    const [selectedTabs, setSelectedTabs] = useState<string[]>(
        dashboard?.tabs?.map((tab) => tab.uuid) || [],
    );

    const exportSelectedTabs =
        isDashboardTabsAvailable && !allTabsSelected && selectedTabs.length > 0
            ? selectedTabs
            : null;

    const hasTilesInSelectedTabs = useCallback(() => {
        if (allTabsSelected) {
            return dashboard.tiles.length > 0;
        }
        return dashboard.tiles.some((tile) =>
            selectedTabs.includes(tile.tabUuid || ''),
        );
    }, [allTabsSelected, dashboard.tiles, selectedTabs]);

    const getPreviewKey = useCallback(
        (width: string) => {
            return `${width}-${selectedTabs.join('-')}`;
        },
        [selectedTabs],
    );

    const currentPreview = previewChoice
        ? previews[getPreviewKey(previewChoice)]
        : undefined;

    const getCsvOptions = useCallback(
        (): SchedulerCsvOptions => ({
            formatted: formatted === Values.FORMATTED,
            limit: limit === Limit.CUSTOM ? customLimit : limit,
            asAttachment: false,
            exportPivotedData,
            xlsxFileLayout:
                exportType === SchedulerFormat.XLSX
                    ? xlsxFileLayout
                    : undefined,
        }),
        [
            customLimit,
            exportPivotedData,
            exportType,
            formatted,
            limit,
            xlsxFileLayout,
        ],
    );

    const handleAsyncExport = useCallback(() => {
        exportDashboardContentMutation.mutate({
            dashboard,
            format: exportType,
            options:
                exportType === SchedulerFormat.IMAGE ? {} : getCsvOptions(),
            dashboardFilters:
                exportType === SchedulerFormat.IMAGE
                    ? undefined
                    : dashboardFilters,
            dateZoomGranularity:
                exportType === SchedulerFormat.IMAGE
                    ? undefined
                    : dateZoomGranularity,
            customViewportWidth:
                exportType === SchedulerFormat.IMAGE && previewChoice
                    ? parseInt(previewChoice)
                    : undefined,
            selectedTabs: exportSelectedTabs,
        });
        onClose();
    }, [
        dashboard,
        dashboardFilters,
        dateZoomGranularity,
        exportDashboardContentMutation,
        exportSelectedTabs,
        exportType,
        getCsvOptions,
        onClose,
        previewChoice,
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
            selectedTabs: exportSelectedTabs,
        });
    }, [
        dashboard,
        exportDashboardMutation,
        exportSelectedTabs,
        getPreviewKey,
        location.search,
        previewChoice,
        previews,
    ]);

    const handlePreviewClick = useCallback(async () => {
        const queryParams = new URLSearchParams(location.search);

        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: `?${queryParams.toString()}`,
            isPreview: true,
            selectedTabs: exportSelectedTabs,
        });

        if (previewChoice) {
            const key = getPreviewKey(previewChoice);
            setPreviews((prev) => ({
                ...prev,
                [key]: url,
            }));
        }
    }, [
        dashboard,
        exportDashboardMutation,
        exportSelectedTabs,
        getPreviewKey,
        location.search,
        previewChoice,
    ]);

    const renderActions = () => {
        if (exportType === SchedulerFormat.CSV) {
            return (
                <Button
                    loading={exportDashboardContentMutation.isLoading}
                    onClick={handleAsyncExport}
                    disabled={limit === Limit.CUSTOM && customLimit < 1}
                    leftSection={<MantineIcon icon={IconCsv} />}
                >
                    Export CSV
                </Button>
            );
        }

        if (exportType === SchedulerFormat.XLSX) {
            return (
                <Button
                    loading={exportDashboardContentMutation.isLoading}
                    onClick={handleAsyncExport}
                    disabled={limit === Limit.CUSTOM && customLimit < 1}
                    leftSection={<MantineIcon icon={IconFileTypeXls} />}
                >
                    Export XLSX
                </Button>
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
        >
            <Stack gap="md">
                <Stack gap="xs">
                    <Input.Label>Export format</Input.Label>
                    <SegmentedControl
                        data={[
                            { label: 'Image', value: SchedulerFormat.IMAGE },
                            { label: '.csv', value: SchedulerFormat.CSV },
                            { label: '.xlsx', value: SchedulerFormat.XLSX },
                        ]}
                        w="min-content"
                        radius="md"
                        value={exportType}
                        onChange={(value) =>
                            setExportType(
                                value as
                                    | SchedulerFormat.IMAGE
                                    | SchedulerFormat.CSV
                                    | SchedulerFormat.XLSX,
                            )
                        }
                    />
                    {exportType !== SchedulerFormat.IMAGE && (
                        <Text fs="italic" fz="sm" c="dimmed">
                            Charts from the selected tabs will be exported as
                            tables
                            {exportType === SchedulerFormat.XLSX &&
                            xlsxFileLayout === 'workbook'
                                ? ' in one workbook.'
                                : ' in a ZIP file.'}
                        </Text>
                    )}
                </Stack>

                {exportType !== SchedulerFormat.IMAGE && (
                    <Stack gap="xs">
                        {!!dateZoomGranularity && (
                            <Callout
                                title="Date zoom is enabled"
                                variant="info"
                            >
                                Your export will include data for the selected
                                date zoom granularity.
                            </Callout>
                        )}
                        <CsvFormattingOptions
                            format={exportType}
                            formatted={formatted}
                            onFormattedChange={setFormatted}
                            limit={limit}
                            onLimitChange={setLimit}
                            customLimit={customLimit}
                            onCustomLimitChange={setCustomLimit}
                            exportPivotedData={exportPivotedData}
                            onExportPivotedDataChange={setExportPivotedData}
                            xlsxFileLayout={xlsxFileLayout}
                            onXlsxFileLayoutChange={setXlsxFileLayout}
                        />
                    </Stack>
                )}

                {isDashboardTabsAvailable && dashboard.tabs.length > 1 && (
                    <Stack gap="xs">
                        <Input.Label>
                            <Group gap="xs">
                                Tabs
                                <Tooltip
                                    withinPortal
                                    maw={400}
                                    variant="xs"
                                    multiline
                                    label="When unchecked, choose specific tabs to include in the export."
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
                                        firstTabUuid ? [firstTabUuid] : [],
                                    );
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

                {exportType === SchedulerFormat.IMAGE && (
                    <Stack gap="xs">
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
