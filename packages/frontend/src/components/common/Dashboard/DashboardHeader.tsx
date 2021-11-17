import { Button, Colors, EditableText, H3, Intent } from '@blueprintjs/core';
import { DashboardChartTile } from 'common';
import React, { useState } from 'react';
import styled from 'styled-components';
import { DEFAULT_DASHBOARD_NAME } from '../../../pages/SavedDashboards';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
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
    dashboardName: string;
    onSaveTitle: (title: string) => void;
};

const DashboardHeader = ({
    onAddTile,
    onSaveDashboard,
    hasTilesChanged,
    isSaving,
    dashboardName,
    onSaveTitle,
}: DashboardHeaderProps) => {
    const { track } = useTracking();
    const [title, setTitle] = useState(dashboardName);
    const [isEditable, setIsEditable] = useState(false);
    const onCancel = () => {
        setTitle(dashboardName);
        setIsEditable(false);
    };
    const onRename = () => {
        if (dashboardName !== title) {
            track({
                name: EventName.UPDATE_DASHBOARD_NAME_CLICKED,
            });
            onSaveTitle(title);
        }
        setIsEditable(false);
    };
    return (
        <WrapperAddTileButton>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <H3
                    style={{
                        margin: 0,
                        marginRight: 5,
                        color:
                            !isEditable && title === DEFAULT_DASHBOARD_NAME
                                ? Colors.GRAY1
                                : undefined,
                    }}
                >
                    <EditableText
                        type="h3"
                        isEditing={isEditable}
                        multiline={false}
                        defaultValue={title}
                        placeholder="Type the dashboard name"
                        disabled={isSaving}
                        onConfirm={onRename}
                        onChange={setTitle}
                        onCancel={onCancel}
                        onEdit={() => setIsEditable(true)}
                    />
                </H3>
                {!isEditable && (
                    <Button
                        icon="edit"
                        disabled={isSaving}
                        onClick={() => setIsEditable(true)}
                        minimal
                    />
                )}
            </div>
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
};

export default DashboardHeader;
