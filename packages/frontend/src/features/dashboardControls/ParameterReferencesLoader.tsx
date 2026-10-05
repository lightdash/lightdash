import { isDashboardChartTileType } from '@lightdash/common';
import { type FC } from 'react';
import { useDashboardChartReadyQuery } from '../../hooks/dashboard/useDashboardChartReadyQuery';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

const TileLoader: FC<{ tileUuid: string; savedChartUuid: string }> = ({
    tileUuid,
    savedChartUuid,
}) => {
    useDashboardChartReadyQuery(tileUuid, savedChartUuid);
    return null;
};

// Chart tiles only report the parameters they reference once their query is
// created, and tiles on other tabs or hosting a mapping never mount. This
// creates the query for the tiles whose references are still unknown.
const ParameterReferencesLoader: FC = () => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );

    return (
        <>
            {(dashboardTiles ?? [])
                .filter(isDashboardChartTileType)
                .map((tile) =>
                    tile.properties.savedChartUuid &&
                    tileParameterReferences[tile.uuid] === undefined ? (
                        <TileLoader
                            key={tile.uuid}
                            tileUuid={tile.uuid}
                            savedChartUuid={tile.properties.savedChartUuid}
                        />
                    ) : null,
                )}
        </>
    );
};

export default ParameterReferencesLoader;
