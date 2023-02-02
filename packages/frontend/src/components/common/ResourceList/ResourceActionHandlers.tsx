import { assertUnreachable, Space } from '@lightdash/common';
import { FC, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useMoveDashboard } from '../../../hooks/dashboard/useDashboard';
import { useMoveMutation } from '../../../hooks/useSavedQuery';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import ChartDeleteModal from '../modal/ChartDeleteModal';
import ChartUpdateModal from '../modal/ChartUpdateModal';
import DashboardDeleteModal from '../modal/DashboardDeleteModal';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import SpaceActionModal, { ActionType } from '../SpaceActionModal';
import { ResourceListItem, ResourceListType } from './ResourceTypeUtils';

export enum ResourceListAction {
    CLOSE,
    UPDATE,
    DELETE,
    CREATE_SPACE,
    MOVE_TO_SPACE,
    ADD_TO_DASHBOARD,
}

export type ResourceListActionState =
    | { type: ResourceListAction.CLOSE }
    | { type: ResourceListAction.UPDATE; item: ResourceListItem }
    | { type: ResourceListAction.DELETE; item: ResourceListItem }
    | { type: ResourceListAction.CREATE_SPACE; item: ResourceListItem }
    | {
          type: ResourceListAction.MOVE_TO_SPACE;
          item: ResourceListItem;
          data: { name: string; spaceUuid: string };
      }
    | { type: ResourceListAction.ADD_TO_DASHBOARD; item: ResourceListItem };

interface ResourceActionHandlersProps {
    action: ResourceListActionState;
    onAction: (action: ResourceListActionState) => void;
}

const ResourceActionHandlers: FC<ResourceActionHandlersProps> = ({
    action,
    onAction,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { mutate: moveChartMutation } = useMoveMutation(
        action.type === ResourceListAction.MOVE_TO_SPACE
            ? action.item.data.uuid
            : undefined,
    );
    const { mutate: moveDashboardMutation } = useMoveDashboard(
        action.type === ResourceListAction.MOVE_TO_SPACE
            ? action.item.data.uuid
            : undefined,
    );

    const handleCloseModal = useCallback(() => {
        onAction({ type: ResourceListAction.CLOSE });
    }, [onAction]);

    const handleCreateSpace = useCallback(
        (space: Space | undefined) => {
            if (!space) return;
            if (action.type !== ResourceListAction.CREATE_SPACE) return;

            onAction({
                type: ResourceListAction.MOVE_TO_SPACE,
                item: action.item,
                data: {
                    name: action.item.data.name,
                    spaceUuid: space.uuid,
                },
            });
        },
        [onAction, action],
    );

    const handleMoveToSpace = useCallback(
        (actionData: { name: string; spaceUuid: string }) => {
            if (action.type !== ResourceListAction.MOVE_TO_SPACE) {
                return;
            }

            switch (action.item.type) {
                case ResourceListType.CHART:
                    return moveChartMutation(actionData);
                case ResourceListType.DASHBOARD:
                    return moveDashboardMutation(actionData);
                default:
                    return assertUnreachable(
                        action.item,
                        'Resource type not supported',
                    );
            }
        },
        [action, moveChartMutation, moveDashboardMutation],
    );

    useEffect(() => {
        if (action.type === ResourceListAction.MOVE_TO_SPACE) {
            handleMoveToSpace(action.data);
        }
    }, [action, handleMoveToSpace]);

    return (
        <>
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
                    shouldRedirect={false}
                    projectUuid={projectUuid}
                    actionType={ActionType.CREATE}
                    title="Create new space"
                    confirmButtonLabel="Create"
                    icon="folder-close"
                    onClose={handleCloseModal}
                    onSubmitForm={handleCreateSpace}
                />
            )}
        </>
    );
};

export default ResourceActionHandlers;
