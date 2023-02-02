import { assertUnreachable } from '@lightdash/common';
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
import { ResourceEmptyStateWrapper } from './ResourceList.styles';
import ResourceListWrapper, {
    ResourceListWrapperProps,
} from './ResourceListWrapper';
import ResourceTable, { ResourceTableCommonProps } from './ResourceTable';
import { ResourceListItem, ResourceListType } from './ResourceTypeUtils';

interface ActionStateWithData {
    actionType: ResourceAction;
    item?: ResourceListItem;
    data?: any;
}

export interface ResourceListCommonProps {
    headerTitle?: string;
    headerAction?: React.ReactNode;
    items: ResourceListItem[];
    showCount?: boolean;
    renderEmptyState: () => React.ReactNode;
}

type ResourceListProps = ResourceListCommonProps &
    ResourceTableCommonProps &
    ResourceListWrapperProps;

const ResourceList: React.FC<ResourceListProps> = ({
    items,
    headerTitle,
    headerAction,
    enableSorting,
    enableMultiSort,
    defaultColumnVisibility,
    defaultSort,
    showCount = true,
    renderEmptyState,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [actionState, setActionState] = useState<ActionStateWithData>({
        actionType: ResourceAction.CLOSE,
    });

    const handleOpenModal = useCallback(
        (actionType: ResourceAction, item: ResourceListItem, data: any) => {
            setActionState({ actionType, item, data });
        },
        [],
    );

    const handleCloseModal = useCallback(() => {
        setActionState({ actionType: ResourceAction.CLOSE });
    }, []);

    const { moveChart, moveDashboard } = useMoveToSpace(
        actionState.item?.type === ResourceListType.CHART,
        actionState.data,
    );

    const handleMoveToSpace = useCallback(
        (actionData: { uuid: string; name: string; spaceUuid?: string }) => {
            if (!actionState.item?.type) {
                return;
            }

            switch (actionState.item.type) {
                case ResourceListType.CHART:
                    return moveChart(actionData);
                case ResourceListType.DASHBOARD:
                    return moveDashboard(actionData);
                default:
                    return assertUnreachable(
                        actionState.item,
                        'Resource type not supported',
                    );
            }
        },
        [moveChart, moveDashboard, actionState],
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
                resourceCount={items.length}
                showCount={showCount}
            >
                {items.length === 0 ? (
                    <ResourceEmptyStateWrapper>
                        {renderEmptyState()}
                    </ResourceEmptyStateWrapper>
                ) : (
                    <ResourceTable
                        items={items}
                        enableSorting={enableSorting}
                        enableMultiSort={enableMultiSort}
                        defaultColumnVisibility={defaultColumnVisibility}
                        defaultSort={defaultSort}
                        onAction={handleOpenModal}
                    />
                )}
            </ResourceListWrapper>

            {actionState.actionType === ResourceAction.UPDATE &&
                actionState.item &&
                (actionState.item.type === ResourceListType.CHART ? (
                    <ChartUpdateModal
                        isOpen={
                            actionState.actionType === ResourceAction.UPDATE
                        }
                        uuid={actionState.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : actionState.item.type === ResourceListType.DASHBOARD ? (
                    <DashboardUpdateModal
                        isOpen={
                            actionState.actionType === ResourceAction.UPDATE
                        }
                        uuid={actionState.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : (
                    assertUnreachable(
                        actionState.item,
                        'Resource type not supported',
                    )
                ))}

            {actionState.actionType === ResourceAction.DELETE &&
                actionState.item &&
                (actionState.item.type === ResourceListType.CHART ? (
                    <ChartDeleteModal
                        isOpen={
                            actionState.actionType === ResourceAction.DELETE
                        }
                        uuid={actionState.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : actionState.item.type === ResourceListType.DASHBOARD ? (
                    <DashboardDeleteModal
                        isOpen={
                            actionState.actionType === ResourceAction.DELETE
                        }
                        uuid={actionState.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : (
                    assertUnreachable(
                        actionState.item,
                        'Resource type not supported',
                    )
                ))}

            {actionState.actionType === ResourceAction.ADD_TO_DASHBOARD &&
                actionState.item && (
                    <AddTilesToDashboardModal
                        savedChart={actionState.item.data}
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
