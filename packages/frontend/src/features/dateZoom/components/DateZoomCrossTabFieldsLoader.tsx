import {
    getChartZoomableFields,
    isDashboardChartTileType,
} from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';

type TileLoaderProps = {
    tileUuid: string;
    savedChartUuid: string;
};

// Reports a single tile's zoomable date fields without mounting the chart.
// Only the active tab's tiles run useDashboardChartReadyQuery, so charts on
// other tabs never report their fields; this fills the gap so the control
// authoring modal can attach charts across tabs.
const TileZoomableFieldsLoader: FC<TileLoaderProps> = ({
    tileUuid,
    savedChartUuid,
}) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const setChartZoomableFields = useDashboardContext(
        (c) => c.setChartZoomableFields,
    );
    const chartQuery = useSavedQuery({
        uuidOrSlug: savedChartUuid,
        projectUuid,
    });
    const { data: explore } = useExplore(
        chartQuery.data?.metricQuery?.exploreName,
    );

    useEffect(() => {
        if (chartQuery.data && explore) {
            setChartZoomableFields(
                tileUuid,
                getChartZoomableFields(explore, chartQuery.data.metricQuery),
            );
        }
    }, [chartQuery.data, explore, setChartZoomableFields, tileUuid]);

    return null;
};

// Prefetches zoomable fields for every chart tile on the dashboard, so the
// date-zoom control modal lists charts on all tabs, not just the active one.
// Rendered only while authoring (edit mode).
export const DateZoomCrossTabFieldsLoader: FC = () => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);

    return (
        <>
            {(dashboardTiles ?? [])
                .filter(isDashboardChartTileType)
                .map((tile) =>
                    tile.properties.savedChartUuid ? (
                        <TileZoomableFieldsLoader
                            key={tile.uuid}
                            tileUuid={tile.uuid}
                            savedChartUuid={tile.properties.savedChartUuid}
                        />
                    ) : null,
                )}
        </>
    );
};
