import { IconName } from '@blueprintjs/core';
import {
    assertUnreachable,
    DashboardBasicDetails,
    SpaceQuery,
} from '@lightdash/common';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import useMoveToSpace from '../../../hooks/useMoveToSpace';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import ChartDeleteModal from '../modal/ChartDeleteModal';
import ChartUpdateModal from '../modal/ChartUpdateModal';
import DashboardDeleteModal from '../modal/DashboardDeleteModal';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import SpaceActionModal, { ActionType } from '../SpaceActionModal';
import { ResourceAction } from './ResourceActionMenu';
import ResourceListWrapper, {
    ResourceListWrapperProps,
} from './ResourceListWrapper';
import ResourceTable, { ResourceTableCommonProps } from './ResourceTable';

export type AcceptedResources = SpaceQuery | DashboardBasicDetails;
export type AcceptedResourceTypes = 'chart' | 'dashboard';

export const getResourceType = (
    resource: AcceptedResources,
): AcceptedResourceTypes => {
    if ('chartType' in resource) {
        return 'chart';
    } else {
        return 'dashboard';
    }
};

interface ActionStateWithData {
    actionType: ResourceAction;
    resourceType?: AcceptedResourceTypes;
    data?: any;
}

export interface ResourceListCommonProps<
    T extends AcceptedResources = AcceptedResources,
> {
    headerTitle?: string;
    headerAction?: React.ReactNode;
    data: T[];
    showCount?: boolean;
    onClickCTA?: () => void;
}

type ResourceListProps = ResourceListCommonProps &
    ResourceTableCommonProps &
    ResourceListWrapperProps;

const ResourceList: React.FC<ResourceListProps> = ({
    data,
    headerTitle,
    headerAction,
    enableSorting,
    enableMultiSort,
    defaultColumnVisibility,
    defaultSort,
    showCount = true,
    // onClickCTA,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [actionState, setActionState] = useState<ActionStateWithData>({
        actionType: ResourceAction.CLOSE,
    });

    const handleOpenModal = useCallback(
        (
            actionType: ResourceAction,
            resourceType: AcceptedResourceTypes,
            actionData: any,
        ) => {
            setActionState({
                actionType,
                resourceType,
                data: actionData,
            });
        },
        [],
    );

    const handleCloseModal = useCallback(() => {
        setActionState({
            actionType: ResourceAction.CLOSE,
            resourceType: undefined,
            data: undefined,
        });
    }, []);

    const { moveChart, moveDashboard } = useMoveToSpace(
        actionState.resourceType === 'chart',
        actionState.data,
    );

    const handleMoveToSpace = useCallback(
        (actionData: { uuid: string; name: string; spaceUuid?: string }) => {
            if (!actionState.resourceType) {
                return;
            }

            switch (actionState.resourceType) {
                case 'chart':
                    return moveChart(actionData);
                case 'dashboard':
                    return moveDashboard(actionData);
                default:
                    return assertUnreachable(
                        actionState.resourceType,
                        'Resource type not supported',
                    );
            }
        },
        [moveChart, moveDashboard, actionState.resourceType],
    );

    useEffect(() => {
        if (
            actionState.actionType === ResourceAction.MOVE_TO_SPACE &&
            actionState.data
        ) {
            handleMoveToSpace(actionState.data);
        }
    }, [actionState, handleMoveToSpace]);

    return (
        <>
            <ResourceListWrapper
                headerTitle={headerTitle}
                headerAction={headerAction}
                resourceCount={data.length}
                showCount={showCount}
            >
                {data.length === 0 ? (
                    <></>
                ) : (
                    // <ResourceEmptyState
                    //     resourceIcon={resourceIcon}
                    //     resourceType={resourceType}
                    //     headerAction={headerAction}
                    //     onClickCTA={onClickCTA}
                    // />
                    <ResourceTable
                        data={data}
                        enableSorting={enableSorting}
                        enableMultiSort={enableMultiSort}
                        defaultColumnVisibility={defaultColumnVisibility}
                        defaultSort={defaultSort}
                        onAction={handleOpenModal}
                    />
                )}
            </ResourceListWrapper>

            {actionState.resourceType &&
                actionState.actionType === ResourceAction.UPDATE &&
                (actionState.resourceType === 'chart' ? (
                    <ChartUpdateModal
                        isOpen={
                            actionState.actionType === ResourceAction.UPDATE
                        }
                        uuid={actionState.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : actionState.resourceType === 'dashboard' ? (
                    <DashboardUpdateModal
                        isOpen={
                            actionState.actionType === ResourceAction.UPDATE
                        }
                        uuid={actionState.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : null)}

            {actionState.resourceType &&
                actionState.actionType === ResourceAction.DELETE &&
                actionState.data &&
                (actionState.resourceType === 'chart' ? (
                    <ChartDeleteModal
                        isOpen={
                            actionState.actionType === ResourceAction.DELETE
                        }
                        uuid={actionState.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : actionState.resourceType === 'dashboard' ? (
                    <DashboardDeleteModal
                        isOpen={
                            actionState.actionType === ResourceAction.DELETE
                        }
                        uuid={actionState.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : null)}

            {actionState.actionType === ResourceAction.ADD_TO_DASHBOARD && (
                <AddTilesToDashboardModal
                    savedChart={actionState.data}
                    isOpen={
                        actionState.actionType ===
                        ResourceAction.ADD_TO_DASHBOARD
                    }
                    onClose={handleCloseModal}
                />
            )}

            {actionState.actionType === ResourceAction.CREATE_SPACE &&
                actionState.data && (
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        actionType={ActionType.CREATE}
                        title="Create new space"
                        confirmButtonLabel="Create"
                        icon="folder-close"
                        onClose={handleCloseModal}
                        onSubmitForm={(space) => {
                            if (space && actionState.data) {
                                handleMoveToSpace({
                                    uuid: actionState.data.uuid,
                                    name: actionState.data.name,
                                    spaceUuid: space.uuid,
                                });
                            }
                        }}
                    />
                )}
        </>
    );
};

export default ResourceList;
