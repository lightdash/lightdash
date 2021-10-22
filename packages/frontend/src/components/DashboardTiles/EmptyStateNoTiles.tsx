import React, { Dispatch, SetStateAction } from 'react';
import { NonIdealState } from '@blueprintjs/core';
import { DashboardChartTile } from 'common';
import { SectionName } from '../../types/Events';
import AddTileButton from './AddTile/AddTileButton';
import { Section } from '../../providers/TrackingProvider';

type EmptyStateNoTilesProps = {
    dashboardTiles: DashboardChartTile[];
    setHasTilesChanged: Dispatch<SetStateAction<boolean>>;
    setTiles: Dispatch<SetStateAction<DashboardChartTile[]>>;
};

const EmptyStateNoTiles = ({
    dashboardTiles,
    setHasTilesChanged,
    setTiles,
}: EmptyStateNoTilesProps) => (
    <Section name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="No charts available"
                action={
                    <AddTileButton
                        onAddTile={(tile: DashboardChartTile) => {
                            setHasTilesChanged(true);
                            setTiles([...dashboardTiles, tile]);
                        }}
                    />
                }
            />
        </div>
    </Section>
);

export default EmptyStateNoTiles;
