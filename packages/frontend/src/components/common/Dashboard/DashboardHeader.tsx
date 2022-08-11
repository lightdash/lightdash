import { Button, Intent } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { Dashboard, UpdatedByUser } from '@lightdash/common';
import { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { DEFAULT_DASHBOARD_NAME } from '../../../pages/SavedDashboards';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import AddTileButton from '../../DashboardTiles/AddTileButton';
import ShareLinkButton from '../../ShareLinkButton';
import { UpdatedInfo, UpdatedLabel } from '../ActionCard';
import EditableHeader from '../EditableHeader';
import {
    ActionButton,
    EditContainer,
    TitleContainer,
    WrapperAddTileButton,
} from './DashboardHeader.styles';

type DashboardHeaderProps = {
    isEditMode: boolean;
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onSaveDashboard: () => void;
    hasDashboardChanged: boolean;
    isSaving: boolean;
    dashboardName: string;
    dashboardDescription?: string;
    dashboardUpdatedByUser?: UpdatedByUser;
    dashboardUpdatedAt: Date;
    onSaveTitle: (title: string) => void;
    onCancel: () => void;
};

const DashboardHeader = ({
    isEditMode,
    onAddTiles,
    onSaveDashboard,
    hasDashboardChanged,
    isSaving,
    dashboardName,
    dashboardDescription,
    dashboardUpdatedByUser,
    dashboardUpdatedAt,
    onSaveTitle,
    onCancel,
}: DashboardHeaderProps) => {
    const [pageLoadedAt] = useState(new Date());
    const timeAgo = useTimeAgo(pageLoadedAt);
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const history = useHistory();
    const { track } = useTracking();
    const [isEditing, setIsEditing] = useState(false);
    const onRename = (value: string) => {
        track({
            name: EventName.UPDATE_DASHBOARD_NAME_CLICKED,
        });
        onSaveTitle(value);
    };

    const { user } = useApp();

    if (user.data?.ability?.cannot('manage', 'Dashboard')) return <></>;

    return (
        <WrapperAddTileButton>
            <div>
                <TitleContainer
                    $isEditing={
                        !isEditing && dashboardName === DEFAULT_DASHBOARD_NAME
                    }
                >
                    <EditableHeader
                        readonly={!isEditMode}
                        isDisabled={isSaving}
                        onChange={onRename}
                        value={dashboardName}
                        placeholder="Type the dashboard name"
                        onIsEditingChange={setIsEditing}
                    />

                    {dashboardDescription && (
                        <Tooltip2
                            content={dashboardDescription}
                            position="bottom"
                        >
                            <Button icon="info-sign" minimal />
                        </Tooltip2>
                    )}

                    <Button
                        icon="edit"
                        disabled={isSaving}
                        onClick={() => console.log('test')}
                        minimal
                    />
                </TitleContainer>

                <UpdatedInfo
                    updatedAt={dashboardUpdatedAt}
                    user={dashboardUpdatedByUser}
                />

                <UpdatedLabel>
                    Last refreshed <b>{timeAgo}</b>
                </UpdatedLabel>
            </div>

            <EditContainer>
                {isEditMode ? (
                    <>
                        <AddTileButton onAddTiles={onAddTiles} />
                        <Tooltip2
                            position="top"
                            content={
                                !hasDashboardChanged
                                    ? 'No changes to save'
                                    : undefined
                            }
                        >
                            <ActionButton
                                text="Save"
                                disabled={!hasDashboardChanged || isSaving}
                                intent={Intent.PRIMARY}
                                onClick={onSaveDashboard}
                            />
                        </Tooltip2>
                        <ActionButton
                            text="Cancel"
                            disabled={isSaving}
                            onClick={onCancel}
                        />
                    </>
                ) : (
                    <>
                        <Button
                            icon="edit"
                            text="Edit dashboard"
                            onClick={() => {
                                history.replace(
                                    `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
                                );
                            }}
                        />

                        <ShareLinkButton
                            url={`${window.location.origin}/projects/${projectUuid}/dashboards/${dashboardUuid}/view`}
                        />
                    </>
                )}
            </EditContainer>
        </WrapperAddTileButton>
    );
};

export default DashboardHeader;
