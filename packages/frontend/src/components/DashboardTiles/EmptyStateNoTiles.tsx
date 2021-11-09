import { NonIdealState } from '@blueprintjs/core';
import { DashboardChartTile } from 'common';
import React from 'react';
import { Section } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import AddTileButton from './AddTile/AddTileButton';

type EmptyStateNoTilesProps = {
    onAddTile: (tile: DashboardChartTile) => void;
};

const EmptyStateNoTiles = ({ onAddTile }: EmptyStateNoTilesProps) => (
    <Section name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="No charts available"
                action={
                    <AddTileButton
                        onAddTile={(tile: DashboardChartTile) =>
                            onAddTile(tile)
                        }
                    />
                }
            />
        </div>
    </Section>
);

export default EmptyStateNoTiles;
