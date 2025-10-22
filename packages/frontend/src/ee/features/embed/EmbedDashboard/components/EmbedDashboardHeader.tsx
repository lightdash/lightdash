import {
    isFilterInteractivityEnabled,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { DateZoom } from '../../../../../features/dateZoom';
import { Parameters } from '../../../../../features/parameters';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import EmbedDashboardExportPdf from './EmbedDashboardExportPdf';
import EmbedDashboardFilters from './EmbedDashboardFilters';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    projectUuid: string;
};

const EmbedDashboardHeader: FC<Props> = ({ dashboard, projectUuid }) => {
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const handleParameterChange = useDashboardContext((c) => c.setParameter);
    const clearAllParameters = useDashboardContext((c) => c.clearAllParameters);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const parameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );
    const areAllChartsLoaded = useDashboardContext((c) => c.areAllChartsLoaded);
    const missingRequiredParameters = useDashboardContext(
        (c) => c.missingRequiredParameters,
    );

    const referencedParameters = useMemo(() => {
        return Object.fromEntries(
            Object.entries(parameterDefinitions).filter(([key]) =>
                parameterReferences.has(key),
            ),
        );
    }, [parameterDefinitions, parameterReferences]);

    const hasHeader =
        dashboard.canDateZoom ||
        dashboard.canChangeParameters ||
        isFilterInteractivityEnabled(dashboard.dashboardFiltersInteractivity);

    // If no header, and exportPagePdf is enabled, show the Export button on the top right corner
    if (!hasHeader && dashboard.canExportPagePdf) {
        return (
            <EmbedDashboardExportPdf
                dashboard={dashboard}
                projectUuid={projectUuid}
                inHeader={false}
            />
        );
    }

    const shouldShowFilters =
        dashboard.dashboardFiltersInteractivity &&
        isFilterInteractivityEnabled(dashboard.dashboardFiltersInteractivity) &&
        !dashboard.dashboardFiltersInteractivity.hidden;
    return (
        <Flex
            justify="flex-end"
            align="center"
            pos="relative"
            m="sm"
            mb="0"
            gap="sm"
            style={{ flexGrow: 1 }}
        >
            {shouldShowFilters && <EmbedDashboardFilters />}
            {dashboard.canChangeParameters && (
                <Parameters
                    isEditMode={false}
                    parameterValues={parameterValues}
                    onParameterChange={handleParameterChange}
                    onClearAll={clearAllParameters}
                    parameters={referencedParameters}
                    isLoading={!areAllChartsLoaded}
                    missingRequiredParameters={missingRequiredParameters}
                />
            )}
            {dashboard.canDateZoom && <DateZoom isEditMode={false} />}

            {dashboard.canExportPagePdf && (
                <EmbedDashboardExportPdf
                    dashboard={dashboard}
                    projectUuid={projectUuid}
                    inHeader={true}
                />
            )}
        </Flex>
    );
};

export default EmbedDashboardHeader;
