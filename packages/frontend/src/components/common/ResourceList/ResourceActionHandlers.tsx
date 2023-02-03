import { assertUnreachable, Space } from '@lightdash/common';
import { FC, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
    useDuplicateDashboardMutation,
    useMoveDashboardMutation,
} from '../../../hooks/dashboard/useDashboard';
import {
    useDuplicateChartMutation,
    useMoveChartMutation,
} from '../../../hooks/useSavedQuery';
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
    DUPLICATE,
    ADD_TO_DASHBOARD,
    CREATE_SPACE,
    MOVE_TO_SPACE,
}

export type ResourceListActionState =
    | { type: ResourceListAction.CLOSE }
    | { type: ResourceListAction.UPDATE; item: ResourceListItem }
    | { type: ResourceListAction.DELETE; item: ResourceListItem }
    | { type: ResourceListAction.DUPLICATE; item: ResourceListItem }
    | { type: ResourceListAction.ADD_TO_DASHBOARD; item: ResourceListItem }
    | { type: ResourceListAction.CREATE_SPACE; item: ResourceListItem }
    | {
          type: ResourceListAction.MOVE_TO_SPACE;
          item: ResourceListItem;
          data: { spaceUuid: string };
      };

interface ResourceActionHandlersProps {
    action: ResourceListActionState;
    onAction: (action: ResourceListActionState) => void;
}

const ResourceActionHandlers: FC<ResourceActionHandlersProps> = ({
    action,
    onAction,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { mutate: moveChartMutation } = useMoveChartMutation();
    const { mutate: moveDashboardMutation } = useMoveDashboardMutation();
    const { mutate: duplicateChart } = useDuplicateChartMutation({
        showRedirectButton: true,
    });
    const { mutate: duplicateDashboard } = useDuplicateDashboardMutation({
        showRedirectButton: true,
    });

    const handleReset = useCallback(() => {
        onAction({ type: ResourceListAction.CLOSE });
    }, [onAction]);

    const handleCreateSpace = useCallback(
        (space: Space | undefined) => {
            if (!space) return;
            if (action.type !== ResourceListAction.CREATE_SPACE) return;

            onAction({
                type: ResourceListAction.MOVE_TO_SPACE,
                item: action.item,
                data: { spaceUuid: space.uuid },
            });
        },
        [onAction, action],
    );

    const handleMoveToSpace = useCallback(() => {
        if (action.type !== ResourceListAction.MOVE_TO_SPACE) return;

        switch (action.item.type) {
            case ResourceListType.CHART:
                return moveChartMutation({
                    uuid: action.item.data.uuid,
                    name: action.item.data.name,
                    ...action.data,
                });
            case ResourceListType.DASHBOARD:
                return moveDashboardMutation({
                    uuid: action.item.data.uuid,
                    name: action.item.data.name,
                    ...action.data,
                });
            default:
                return assertUnreachable(
                    action.item,
                    'Resource type not supported',
                );
        }
    }, [action, moveChartMutation, moveDashboardMutation]);

    const handleDuplicate = useCallback(() => {
        if (action.type !== ResourceListAction.DUPLICATE) return;

        switch (action.item.type) {
            case ResourceListType.CHART:
                return duplicateChart(action.item.data.uuid);
            case ResourceListType.DASHBOARD:
                return duplicateDashboard(action.item.data.uuid);
            default:
                return assertUnreachable(
                    action.item,
                    'Resource type not supported',
                );
        }
    }, [action, duplicateChart, duplicateDashboard]);

    useEffect(() => {
        if (action.type === ResourceListAction.MOVE_TO_SPACE) {
            handleMoveToSpace();
            handleReset();
        }
    }, [action, handleMoveToSpace, handleReset]);

    useEffect(() => {
        if (action.type === ResourceListAction.DUPLICATE) {
            handleDuplicate();
            handleReset();
        }
    }, [action, handleDuplicate, handleReset]);

    return (
        <>
            {action.type === ResourceListAction.UPDATE &&
                (action.item.type === ResourceListType.CHART ? (
                    <ChartUpdateModal
                        isOpen
                        uuid={action.item.data.uuid}
                        onClose={handleReset}
                        onConfirm={handleReset}
                    />
                ) : action.item.type === ResourceListType.DASHBOARD ? (
                    <DashboardUpdateModal
                        isOpen
                        uuid={action.item.data.uuid}
                        onClose={handleReset}
                        onConfirm={handleReset}
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
                        onClose={handleReset}
                        onConfirm={handleReset}
                    />
                ) : action.item.type === ResourceListType.DASHBOARD ? (
                    <DashboardDeleteModal
                        isOpen
                        uuid={action.item.data.uuid}
                        onClose={handleReset}
                        onConfirm={handleReset}
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
                    onClose={handleReset}
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
                    onClose={handleReset}
                    onSubmitForm={handleCreateSpace}
                />
            )}
        </>
    );
};

export default ResourceActionHandlers;
