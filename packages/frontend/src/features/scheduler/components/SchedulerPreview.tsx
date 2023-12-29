import {
    applyDimensionOverrides,
    Dashboard,
    DashboardScheduler,
    SchedulerFilterRule,
} from '@lightdash/common';
import { FC, useCallback, useEffect, useState } from 'react';
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

    useEffect(() => {
        onChange(
            previewChoice === CUSTOM_WIDTH_OPTIONS[1].value
                ? undefined
                : previewChoice,
        );
    }, [onChange, previewChoice]);

    return (
        <PreviewAndCustomizeScreenshot
            exportMutation={exportDashboardMutation}
            previews={previews}
            setPreviews={setPreviews}
            previewChoice={previewChoice}
            setPreviewChoice={setPreviewChoice}
            onPreviewClick={handlePreviewClick}
        />
    );
};
