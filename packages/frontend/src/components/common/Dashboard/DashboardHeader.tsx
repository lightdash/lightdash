import React from 'react';
import { Button, Intent, EditableText } from '@blueprintjs/core';
import { DashboardChartTile } from 'common';
import styled from 'styled-components';
import AddTileButton from '../../DashboardTiles/AddTile/AddTileButton';
import '../../../styles/dashboard-header.css';

const WrapperAddTileButton = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-between;
    padding: 10px;
`;

type DashboardHeaderProps = {
    onAddTile: (tile: DashboardChartTile) => void;
    onChangeDashboardName: (name: string) => void;
    onSaveDashboard: () => void;
    onConfirmName: () => void;
    hasTilesChanged: boolean;
    isSaving: boolean;
    dashboardName: string | undefined;
};

const DashboardHeader = ({
    onAddTile,
    onChangeDashboardName,
    onSaveDashboard,
    onConfirmName,
    hasTilesChanged,
    isSaving,
    dashboardName,
}: DashboardHeaderProps) => (
    <WrapperAddTileButton>
        <EditableText
            value={dashboardName}
            onChange={(value) => onChangeDashboardName(value)}
            onConfirm={onConfirmName}
        />
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
