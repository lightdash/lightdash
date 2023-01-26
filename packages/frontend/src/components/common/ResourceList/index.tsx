import { IconName } from '@blueprintjs/core';
import {
    assertUnreachable,
    DashboardBasicDetails,
    SpaceQuery,
} from '@lightdash/common';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useUpdateDashboardName } from '../../../hooks/dashboard/useDashboard';
import useMoveToSpace from '../../../hooks/useMoveToSpace';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import ChartDeleteModal from '../modal/ChartDeleteModal';
import ChartUpdateModal from '../modal/ChartUpdateModal';
import DashboardDeleteModal from '../modal/DashboardDeleteModal';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import SpaceActionModal, { ActionType } from '../SpaceActionModal';
import { ResourceAction } from './ResourceActionMenu';
import ResourceEmptyState from './ResourceEmptyState';
import ResourceListWrapper, {
    ResourceListWrapperProps,
} from './ResourceListWrapper';
import ResourceTable, { ResourceTableCommonProps } from './ResourceTable';

export type AcceptedResources = SpaceQuery | DashboardBasicDetails;
export type AcceptedResourceTypes = 'chart' | 'dashboard';

interface ActionStateWithData {
    actionType: ResourceAction;
    data?: any;
}

export interface ResourceListCommonProps<
    T extends AcceptedResources = AcceptedResources,
> {
    headerTitle?: string;
    headerAction?: React.ReactNode;
    resourceList: T[];
    resourceType: AcceptedResourceTypes;
    resourceIcon: IconName;
    showCount?: boolean;
    getURL: (data: T) => string;
    onClickCTA?: () => void;
}

type ResourceListProps = ResourceListCommonProps &
    ResourceTableCommonProps &
    ResourceListWrapperProps;

const ResourceList: React.FC<ResourceListProps> = ({
    headerTitle,
    headerAction,
    resourceIcon,
    resourceList,
    resourceType,
    enableSorting,
    enableMultiSort,
    defaultColumnVisibility,
    defaultSort,
    showCount = true,
    getURL,
    onClickCTA,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [actionState, setActionState] = useState<ActionStateWithData>({
        actionType: ResourceAction.CLOSE,
    });

    const { moveChart, moveDashboard } = useMoveToSpace(
        resourceType === 'chart',
        actionState.data,
    );

    const actions = useMemo(() => {
        switch (resourceType) {
            case 'dashboard':
                return {
                    update: useUpdateDashboardName,
                    moveToSpace: moveDashboard,
                };
            case 'chart':
                return {
                    update: useUpdateMutation,
                    moveToSpace: moveChart,
                };
            default:
                return assertUnreachable(
                    resourceType,
                    'Unexpected resource type',
                );
        }
    }, [moveChart, moveDashboard, resourceType]);

    useEffect(() => {
        if (
            actionState.actionType === ResourceAction.MOVE_TO_SPACE &&
            actionState.data
        ) {
            actions.moveToSpace(actionState.data);
        }
    }, [actionState, actions]);

    return (
        <>
            <ResourceListWrapper
                headerTitle={headerTitle}
                headerAction={headerAction}
                resourceCount={resourceList.length}
                showCount={showCount}
            >
                {resourceList.length === 0 ? (
                    <ResourceEmptyState
                        resourceIcon={resourceIcon}
                        resourceType={resourceType}
                        headerAction={headerAction}
                        onClickCTA={onClickCTA}
                    />
                ) : (
                    <ResourceTable
                        resourceType={resourceType}
                        resourceIcon={resourceIcon}
                        resourceList={resourceList}
                        enableSorting={enableSorting}
                        enableMultiSort={enableMultiSort}
                        defaultColumnVisibility={defaultColumnVisibility}
                        defaultSort={defaultSort}
                        getURL={getURL}
                        onChangeAction={setActionState}
                    />
                )}
            </ResourceListWrapper>

            {actionState.actionType === ResourceAction.UPDATE &&
                (resourceType === 'chart' ? (
                    <ChartUpdateModal
                        isOpen={
                            actionState.actionType === ResourceAction.UPDATE
                        }
                        uuid={actionState.data.uuid}
                        onClose={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                        onConfirm={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                    />
                ) : resourceType === 'dashboard' ? (
                    <DashboardUpdateModal
                        isOpen={
                            actionState.actionType === ResourceAction.UPDATE
                        }
                        uuid={actionState.data.uuid}
                        onClose={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                        onConfirm={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                    />
                ) : null)}

            {actionState.actionType === ResourceAction.DELETE &&
                actionState.data &&
                (resourceType === 'chart' ? (
                    <ChartDeleteModal
                        isOpen={
                            actionState.actionType === ResourceAction.DELETE
                        }
                        uuid={actionState.data.uuid}
                        onClose={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                        onConfirm={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                    />
                ) : resourceType === 'dashboard' ? (
                    <DashboardDeleteModal
                        isOpen={
                            actionState.actionType === ResourceAction.DELETE
                        }
                        uuid={actionState.data.uuid}
                        onClose={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                        onConfirm={() => {
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            });
                        }}
                    />
                ) : null)}

            {actionState.actionType === ResourceAction.ADD_TO_DASHBOARD && (
                <AddTilesToDashboardModal
                    savedChart={actionState.data}
                    isOpen={
                        actionState.actionType ===
                        ResourceAction.ADD_TO_DASHBOARD
                    }
                    onClose={() =>
                        setActionState({ actionType: ResourceAction.CLOSE })
                    }
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
                        onClose={() =>
                            setActionState({
                                actionType: ResourceAction.CLOSE,
                            })
                        }
                        onSubmitForm={(space) => {
                            if (space && actionState.data) {
                                actions.moveToSpace({
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
