import {
    isFilterInteractivityEnabled,
    isParameterInteractivityEnabled,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { Group } from '@mantine-8/core';
import { type FC } from 'react';
import { DateZoom } from '../../../../../features/dateZoom';
import EmbedDashboardExportPdf from './EmbedDashboardExportPdf';
import EmbedDashboardFilters from './EmbedDashboardFilters';
import EmbedDashboardParameters from './EmbedDashboardParameters';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    projectUuid: string;
};

const EmbedDashboardHeader: FC<Props> = ({ dashboard, projectUuid }) => {
    const hasHeader =
        dashboard.canDateZoom ||
        isParameterInteractivityEnabled(dashboard.parameterInteractivity) ||
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
        <Group
            justify="flex-start"
            align="center"
            wrap="wrap"
            pos="relative"
            m="sm"
            mb="0"
            gap="sm"
        >
            {isParameterInteractivityEnabled(
                dashboard.parameterInteractivity,
            ) && <EmbedDashboardParameters />}
            {dashboard.canDateZoom && <DateZoom isEditMode={false} />}

            {dashboard.canExportPagePdf && (
                <EmbedDashboardExportPdf
                    dashboard={dashboard}
                    projectUuid={projectUuid}
                    inHeader={true}
                />
            )}
            {shouldShowFilters && <EmbedDashboardFilters />}
        </Group>
    );
};

export default EmbedDashboardHeader;
