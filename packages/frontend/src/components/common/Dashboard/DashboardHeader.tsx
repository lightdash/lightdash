import { Button, Classes, Intent } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    Dashboard,
    UpdateDashboardDetails,
    UpdatedByUser,
} from '@lightdash/common';
import { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import AddTileButton from '../../DashboardTiles/AddTileButton';
import UpdateDashboardModal from '../../SavedDashboards/UpdateDashboardModal';
import ShareLinkButton from '../../ShareLinkButton';
import { UpdatedInfo } from '../ActionCard';
import {
    IconWithRightMargin,
    PageActionsContainer,
    PageDetailsContainer,
    PageHeaderContainer,
    PageTitle,
    PageTitleAndDetailsContainer,
    PageTitleContainer,
    SeparatorDot,
} from '../PageHeader';

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
    dashboardSpaceName?: string;
    onUpdate: (values?: UpdateDashboardDetails) => void;
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
    dashboardSpaceName,
    onUpdate,
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
    const [isUpdating, setIsUpdating] = useState(false);

    const handleEditClick = () => {
        setIsUpdating(true);
        track({ name: EventName.UPDATE_DASHBOARD_NAME_CLICKED });
    };

    const handleUpdate = (value?: UpdateDashboardDetails) => {
        onUpdate(value);
        setIsUpdating(false);
    };

    const { user } = useApp();

    if (user.data?.ability?.cannot('manage', 'Dashboard')) return <></>;

    return (
        <PageHeaderContainer>
            <PageTitleAndDetailsContainer>
                <PageTitleContainer className={Classes.TEXT_OVERFLOW_ELLIPSIS}>
                    <PageTitle>{dashboardName}</PageTitle>

                    {dashboardDescription && (
                        <Tooltip2
                            content={dashboardDescription}
                            position="bottom"
                        >
                            <Button icon="info-sign" minimal />
                        </Tooltip2>
                    )}

                    {user.data?.ability?.can('manage', 'Dashboard') && (
                        <Button
                            icon="edit"
                            disabled={isSaving}
                            onClick={handleEditClick}
                            minimal
                        />
                    )}

                    <UpdateDashboardModal
                        dashboardUuid={dashboardUuid}
                        isOpen={isUpdating}
                        onClose={handleUpdate}
                    />
                </PageTitleContainer>

                <PageDetailsContainer>
                    <span>
                        Last refreshed <b>{timeAgo}</b>
                    </span>
                    <SeparatorDot icon="dot" size={6} />
                    <UpdatedInfo
                        updatedAt={dashboardUpdatedAt}
                        user={dashboardUpdatedByUser}
                    />
                    {dashboardSpaceName && (
                        <>
                            <SeparatorDot icon="dot" size={6} />
                            <IconWithRightMargin
                                icon="folder-close"
                                size={10}
                            />
                            {dashboardSpaceName}
                        </>
                    )}
                </PageDetailsContainer>
            </PageTitleAndDetailsContainer>

            {isEditMode ? (
                <PageActionsContainer>
                    <AddTileButton onAddTiles={onAddTiles} />

                    <Tooltip2
                        position="top"
                        content={
                            !hasDashboardChanged
                                ? 'No changes to save'
                                : undefined
                        }
                    >
                        <Button
                            text="Save"
                            disabled={!hasDashboardChanged || isSaving}
                            intent={Intent.PRIMARY}
                            onClick={onSaveDashboard}
                        />
                    </Tooltip2>

                    <Button
                        text="Cancel"
                        disabled={isSaving}
                        onClick={onCancel}
                    />
                </PageActionsContainer>
            ) : (
                <PageActionsContainer>
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
                </PageActionsContainer>
            )}
        </PageHeaderContainer>
    );
};

export default DashboardHeader;
