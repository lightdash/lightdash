import {
    isFilterInteractivityEnabled,
    isParameterInteractivityEnabled,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import EmbedDashboardExportPdf from './EmbedDashboardExportPdf';
import EmbedDashboardFilterBar from './EmbedDashboardFilterBar';
import styles from './EmbedDashboardHeader.module.css';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    projectUuid: string;
    /** Tab switcher, pinned on top of the filters when the dashboard has tabs */
    tabs?: ReactNode;
};

const EmbedDashboardHeader: FC<Props> = ({ dashboard, projectUuid, tabs }) => {
    const hasFilterBar =
        dashboard.canDateZoom ||
        isParameterInteractivityEnabled(dashboard.parameterInteractivity) ||
        isFilterInteractivityEnabled(dashboard.dashboardFiltersInteractivity);

    if (!hasFilterBar && !tabs && !dashboard.canExportPagePdf) {
        return null;
    }

    const shouldShowFilters = Boolean(
        dashboard.dashboardFiltersInteractivity &&
        isFilterInteractivityEnabled(dashboard.dashboardFiltersInteractivity) &&
        !dashboard.dashboardFiltersInteractivity.hidden,
    );

    const isSticky = Boolean(dashboard.stickyHeader);

    const filterBar = hasFilterBar ? (
        <EmbedDashboardFilterBar
            dashboard={dashboard}
            shouldShowFilters={shouldShowFilters}
        />
    ) : null;

    return (
        <Box
            className={styles.headerBar}
            data-sticky={isSticky}
            data-has-tabs={Boolean(tabs)}
        >
            <Box className={styles.primary}>{tabs ?? filterBar}</Box>
            {dashboard.canExportPagePdf && (
                <Box className={styles.actions}>
                    <EmbedDashboardExportPdf
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                    />
                </Box>
            )}
            {tabs && filterBar && (
                <Box className={styles.secondary}>{filterBar}</Box>
            )}
            {/* The scroll-state query can't style the container's own pseudo-elements, so the stuck border needs a real descendant */}
            {isSticky && <Box className={styles.stuckBorder} />}
        </Box>
    );
};

export default EmbedDashboardHeader;
