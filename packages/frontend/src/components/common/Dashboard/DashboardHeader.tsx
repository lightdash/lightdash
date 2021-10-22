import React from 'react';
import { Button, Intent } from '@blueprintjs/core';
import { DashboardChartTile } from 'common';
import styled from 'styled-components';
import AddTileButton from '../../DashboardTiles/AddTile/AddTileButton';

const WrapperAddTileButton = styled.div`
    display: flex;
    width: 100%;
    justify-content: flex-end;
    padding: 10px;
`;

type DashboardHeaderProps = {
    onAddTile: (tile: DashboardChartTile) => void;
    onSaveDashboard: () => void;
    hasTilesChanged: boolean;
    isSaving: boolean;
};

const DashboardHeader = ({
    onAddTile,
    onSaveDashboard,
    hasTilesChanged,
    isSaving,
}: DashboardHeaderProps) => (
    <WrapperAddTileButton>
        <Button
            style={{ height: '20px' }}
            text="Save"
            disabled={!hasTilesChanged || isSaving}
            intent={Intent.PRIMARY}
            onClick={onSaveDashboard}
        />
        <AddTileButton
            onAddTile={(tile: DashboardChartTile) => onAddTile(tile)}
        />
    </WrapperAddTileButton>
);

export default DashboardHeader;
