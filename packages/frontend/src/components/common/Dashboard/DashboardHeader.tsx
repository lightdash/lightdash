import { Button, Colors, EditableText, H3, Intent } from '@blueprintjs/core';
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
    const [title, setTitle] = useState(dashboardName);
    const [isEditable, setIsEditable] = useState(false);
    const onRenameCancel = () => {
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
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
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
                        disabled={isSaving || !isEditMode}
                        onConfirm={onRename}
                        onChange={setTitle}
                        onCancel={onRenameCancel}
                        onEdit={() => setIsEditable(true)}
                    />
                </H3>
                {!isEditMode && (
                    <p
                        style={{
                            color: Colors.GRAY1,
                            margin: 0,
                            alignSelf: 'flex-end',
                            lineHeight: '20px',
                        }}
                    >
                        Last refreshed {timeAgo}
                    </p>
                )}
                {!isEditable && isEditMode && (
                    <Button
                        icon="edit"
                        disabled={isSaving}
                        onClick={() => setIsEditable(true)}
                        minimal
                    />
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
