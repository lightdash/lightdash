import { H4, NonIdealState } from '@blueprintjs/core';
import { Dashboard } from 'common';
import React from 'react';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AddTileButton from '../AddTileButton';
import {
    EmptyStateIcon,
    NoSavedChartsWrapper,
} from './EmptyStateNoTiles.styles';

type EmptyStateNoTilesProps = {
    onAddTile: (tile: Dashboard['tiles'][number]) => void;
};

const NoSavedCharts = () => (
    <NoSavedChartsWrapper>
        <EmptyStateIcon icon="grouped-bar-chart" size={59} />
        <H4>You haven’t saved any charts yet.</H4>
        <p>
            Create a saved chart from your queries so you can add it to this
            dashboard!
        </p>
    </NoSavedChartsWrapper>
);

const EmptyStateNoTiles = ({ onAddTile }: EmptyStateNoTilesProps) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description={<NoSavedCharts />}
                action={<AddTileButton onAddTile={onAddTile} />}
            />
        </div>
    </TrackSection>
);

export default EmptyStateNoTiles;
