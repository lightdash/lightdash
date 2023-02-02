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
import { ResourceListAction } from './ResourceActionMenu';
import { ResourceEmptyStateWrapper } from './ResourceList.styles';
import ResourceListWrapper, {
    ResourceListWrapperProps,
} from './ResourceListWrapper';
import ResourceTable, { ResourceTableCommonProps } from './ResourceTable';
import { ResourceListItem, ResourceListType } from './ResourceTypeUtils';

export type ResourceListActionState =
    | { type: ResourceListAction.CLOSE }
    | { type: ResourceListAction.UPDATE; item: ResourceListItem }
    | { type: ResourceListAction.DELETE; item: ResourceListItem }
    | { type: ResourceListAction.CREATE_SPACE; item: ResourceListItem }
    | {
          type: ResourceListAction.MOVE_TO_SPACE;
          item: ResourceListItem;
          data: { uuid: string; name: string; spaceUuid?: string };
      }
    | { type: ResourceListAction.ADD_TO_DASHBOARD; item: ResourceListItem };

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

    const [action, setAction] = useState<ResourceListActionState>({
        type: ResourceListAction.CLOSE,
    });

    const handleAction = useCallback((newAction: ResourceListActionState) => {
        setAction(newAction);
    }, []);

    const handleCloseModal = useCallback(() => {
        handleAction({ type: ResourceListAction.CLOSE });
    }, []);

    const { moveChart, moveDashboard } = useMoveToSpace(
        action.type === ResourceListAction.MOVE_TO_SPACE &&
            action.item.type === ResourceListType.CHART,
        action.type === ResourceListAction.MOVE_TO_SPACE
            ? action.data
            : undefined,
    );

    const handleMoveToSpace = useCallback(
        (actionData: { uuid: string; name: string; spaceUuid?: string }) => {
            if (action.type !== ResourceListAction.MOVE_TO_SPACE) {
                return;
            }

            switch (action.item.type) {
                case ResourceListType.CHART:
                    return moveChart(actionData);
                case ResourceListType.DASHBOARD:
                    return moveDashboard(actionData);
                default:
                    return assertUnreachable(
                        action.item,
                        'Resource type not supported',
                    );
            }
        },
        [moveChart, moveDashboard, action],
    );

    useEffect(() => {
        if (action.type === ResourceListAction.MOVE_TO_SPACE) {
            handleMoveToSpace(action.data);
        }
    }, [action, handleMoveToSpace]);

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
                        onAction={handleAction}
                    />
                )}
            </ResourceListWrapper>

            {action.type === ResourceListAction.UPDATE &&
                (action.item.type === ResourceListType.CHART ? (
                    <ChartUpdateModal
                        isOpen
                        uuid={action.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : action.item.type === ResourceListType.DASHBOARD ? (
                    <DashboardUpdateModal
                        isOpen
                        uuid={action.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : (
                    assertUnreachable(
                        action.item,
                        'Resource type not supported',
                    )
                ))}

            {action.type === ResourceListAction.DELETE &&
                (action.item.type === ResourceListType.CHART ? (
                    <ChartDeleteModal
                        isOpen
                        uuid={action.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : action.item.type === ResourceListType.DASHBOARD ? (
                    <DashboardDeleteModal
                        isOpen
                        uuid={action.item.data.uuid}
                        onClose={handleCloseModal}
                        onConfirm={handleCloseModal}
                    />
                ) : (
                    assertUnreachable(
                        action.item,
                        'Resource type not supported',
                    )
                ))}

            {action.type === ResourceListAction.ADD_TO_DASHBOARD && (
                <AddTilesToDashboardModal
                    savedChart={action.item.data}
                    isOpen
                    onClose={handleCloseModal}
                />
            )}

            {action.type === ResourceListAction.CREATE_SPACE && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    actionType={ActionType.CREATE}
                    title="Create new space"
                    confirmButtonLabel="Create"
                    icon="folder-close"
                    onClose={handleCloseModal}
                    onSubmitForm={(space) => {
                        if (space) {
                            handleAction({
                                type: ResourceListAction.MOVE_TO_SPACE,
                                item: action.item,
                                data: {
                                    uuid: action.item.data.uuid,
                                    name: action.item.data.name,
                                    spaceUuid: space.uuid,
                                },
                            });
                        }
                    }}
                />
            )}
        </>
    );
};

export default ResourceList;
