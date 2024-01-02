import {
    applyDimensionOverrides,
    Dashboard,
    DashboardScheduler,
    SchedulerFilterRule,
} from '@lightdash/common';
import { Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExportDashboard } from '../../../hooks/dashboard/useDashboard';
import { PreviewAndCustomizeScreenshot } from '../../preview';
import { CUSTOM_WIDTH_OPTIONS } from '../constants';

type Props = {
    dashboard: Dashboard;
    schedulerFilters: SchedulerFilterRule[] | undefined;
    customViewportWidth: DashboardScheduler['customViewportWidth'];
    onChange: (previewChoice: string | undefined) => void;
};

export const SchedulerPreview: FC<Props> = ({
    dashboard,
    schedulerFilters,
    customViewportWidth,
    onChange,
}) => {
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<
        typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined
    >(customViewportWidth?.toString() ?? CUSTOM_WIDTH_OPTIONS[1].value);
    const exportDashboardMutation = useExportDashboard();

    const getSchedulerFilterOverridesQueryString = useCallback(() => {
        if (schedulerFilters) {
            const overriddenDimensions = applyDimensionOverrides(
                dashboard.filters,
                schedulerFilters,
            );

            const filtersParam = encodeURIComponent(
                JSON.stringify({
                    dimensions: overriddenDimensions,
                    metrics: [],
                    tableCalculations: [],
                }),
            );
            return `?filters=${filtersParam}`;
        }
        return '';
    }, [dashboard.filters, schedulerFilters]);

    const handlePreviewClick = useCallback(async () => {
        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: getSchedulerFilterOverridesQueryString(),
            isPreview: true,
        });

        setPreviews((prev) => ({
            ...prev,
            ...(previewChoice ? { [previewChoice]: url } : {}),
        }));
    }, [
        dashboard,
        exportDashboardMutation,
        previewChoice,
        getSchedulerFilterOverridesQueryString,
    ]);

    return (
        <Stack p="md">
            <Group spacing="xs">
                <Text fw={600}>
                    Preview your Scheduled Delivery and Customize
                </Text>
                <Tooltip
                    multiline
                    withinPortal
                    maw={350}
                    label="You can preview your Scheduled Delivery below. You are also
                able to customize the size of the Scheduled Delivery to ensure it is sent as expected. The filters you have applied to this scheduled delivery will be applied to the preview."
                >
                    <MantineIcon icon={IconInfoCircle} />
                </Tooltip>
            </Group>
            <PreviewAndCustomizeScreenshot
                exportMutation={exportDashboardMutation}
                previews={previews}
                setPreviews={setPreviews}
                previewChoice={previewChoice}
                setPreviewChoice={(pc: string | undefined) => {
                    setPreviewChoice(() => {
                        onChange(
                            pc === CUSTOM_WIDTH_OPTIONS[1].value
                                ? undefined
                                : pc,
                        );
                        return pc;
                    });
                }}
                onPreviewClick={handlePreviewClick}
            />
        </Stack>
    );
};
