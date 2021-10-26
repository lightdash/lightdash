import React from 'react';
import { Button, Intent, H3 } from '@blueprintjs/core';
import { DashboardChartTile } from 'common';
import styled from 'styled-components';
import AddTileButton from '../../DashboardTiles/AddTile/AddTileButton';

const WrapperAddTileButton = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
`;

type DashboardHeaderProps = {
    onAddTile: (tile: DashboardChartTile) => void;
    onSaveDashboard: () => void;
    hasTilesChanged: boolean;
    isSaving: boolean;
    dashboardName: string | undefined;
};

const DashboardHeader = ({
    onAddTile,
    onSaveDashboard,
    hasTilesChanged,
    isSaving,
    dashboardName,
}: DashboardHeaderProps) => (
    <WrapperAddTileButton>
        <H3>{dashboardName}</H3>
        <div>
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
        </div>
    </WrapperAddTileButton>
);

export default DashboardHeader;
