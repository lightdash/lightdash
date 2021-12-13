import { NonIdealState } from '@blueprintjs/core';
import { Dashboard } from 'common';
import React from 'react';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import AddTileButton from './AddTileButton';

type EmptyStateNoTilesProps = {
    onAddTile: (tile: Dashboard['tiles'][number]) => void;
};

const EmptyStateNoTiles = ({ onAddTile }: EmptyStateNoTilesProps) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="No charts available"
                action={<AddTileButton onAddTile={onAddTile} />}
            />
        </div>
    </TrackSection>
);

export default EmptyStateNoTiles;
