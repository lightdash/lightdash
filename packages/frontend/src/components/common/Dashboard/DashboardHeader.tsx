import { Button, Colors, Intent } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { Dashboard } from 'common';
import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { DEFAULT_DASHBOARD_NAME } from '../../../pages/SavedDashboards';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import AddTileButton from '../../DashboardTiles/AddTileButton';
import EditableText from '../EditableText';

const WrapperAddTileButton = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    height: 50px;
`;

type DashboardHeaderProps = {
    isEditMode: boolean;
    onAddTile: (tile: Dashboard['tiles'][number]) => void;
    onSaveDashboard: () => void;
    hasTilesChanged: boolean;
    isSaving: boolean;
    dashboardName: string;
    onSaveTitle: (title: string) => void;
    onCancel: () => void;
};

const DashboardHeader = ({
    isEditMode,
    onAddTile,
    onSaveDashboard,
    hasTilesChanged,
    isSaving,
    dashboardName,
    onSaveTitle,
    onCancel,
}: DashboardHeaderProps) => {
    const [pageLoadedAt] = useState(new Date());
    const timeAgo = useTimeAgo(pageLoadedAt);
    const { projectUuid, dashboardUuid } =
        useParams<{ projectUuid: string; dashboardUuid: string }>();
    const history = useHistory();
    const { track } = useTracking();
    const [isEditing, setIsEditing] = useState(false);
    const onRename = (value: string) => {
        track({
            name: EventName.UPDATE_DASHBOARD_NAME_CLICKED,
        });
        onSaveTitle(value);
    };
    return (
        <WrapperAddTileButton>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    color:
                        !isEditing && dashboardName === DEFAULT_DASHBOARD_NAME
                            ? Colors.GRAY1
                            : undefined,
                }}
            >
                <EditableText
                    readonly={!isEditMode}
                    isDisabled={isSaving}
                    onChange={onRename}
                    value={dashboardName}
                    placeholder="Type the dashboard name"
                    onIsEditingChange={setIsEditing}
                />
                {!isEditMode && (
                    <p
                        style={{
                            color: Colors.GRAY1,
                            margin: 0,
                            alignSelf: 'flex-end',
                            lineHeight: '20px',
                            marginLeft: 5,
                        }}
                    >
                        Last refreshed {timeAgo}
                    </p>
                )}
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    alignContent: 'center',
                    justifyItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {isEditMode ? (
                    <>
                        <AddTileButton onAddTile={onAddTile} />
                        <Tooltip2
                            position="top"
                            content={
                                !hasTilesChanged
                                    ? 'No changes to save'
                                    : undefined
                            }
                        >
                            <Button
                                style={{ height: '20px', marginLeft: 10 }}
                                text="Save"
                                disabled={!hasTilesChanged || isSaving}
                                intent={Intent.PRIMARY}
                                onClick={onSaveDashboard}
                            />
                        </Tooltip2>
                        <Button
                            style={{ height: '20px', marginLeft: 10 }}
                            text="Cancel"
                            disabled={isSaving}
                            onClick={onCancel}
                        />
                    </>
                ) : (
                    <Button
                        icon="edit"
                        text="Edit"
                        onClick={() => {
                            history.push(
                                `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
                            );
                        }}
                    />
                )}
            </div>
        </WrapperAddTileButton>
    );
};

export default DashboardHeader;
