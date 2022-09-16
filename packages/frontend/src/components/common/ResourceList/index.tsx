import { IconName } from '@blueprintjs/core';
import {
    assertUnreachable,
    DashboardBasicDetails,
    Space,
    SpaceQuery,
} from '@lightdash/common';
import React, { useEffect, useMemo, useState } from 'react';
import { useUpdateDashboardName } from '../../../hooks/dashboard/useDashboard';
import useMoveToSpace from '../../../hooks/useMoveToSpace';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import { CreateSpaceModal } from '../../Explorer/SpaceBrowser/CreateSpaceModal';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import DashboardForm from '../../SavedDashboards/DashboardForm';
import SavedQueryForm from '../../SavedQueries/SavedQueryForm';
import { ActionTypeModal } from '../modal/ActionModal';
import DeleteActionModal from '../modal/DeleteActionModal';
import UpdateActionModal from '../modal/UpdateActionModal';
import ResourceEmptyState from './ResourceEmptyState';
import ResourceListWrapper, {
    ResourceListWrapperProps,
} from './ResourceListWrapper';
import ResourceTable from './ResourceTable';

export type AcceptedResources = SpaceQuery | DashboardBasicDetails;
export type AcceptedResourceTypes = 'chart' | 'dashboard';

interface ActionStateWithData {
    actionType: ActionTypeModal;
    data?: any;
}

export type ResourceListProps<T extends AcceptedResources = AcceptedResources> =
    ResourceListWrapperProps & {
        headerTitle?: string;
        headerAction?: React.ReactNode;
        resourceList: T[];
        resourceType: AcceptedResourceTypes;
        resourceIcon: IconName;
        showSpaceColumn?: boolean;
        enableSorting?: boolean;
        showCount?: boolean;
        getURL: (data: T) => string;
    };

const ResourceList: React.FC<ResourceListProps> = ({
    headerTitle,
    headerAction,
    resourceIcon,
    resourceList,
    resourceType,
    showSpaceColumn = false,
    enableSorting = true,
    showCount = true,
    getURL,
}) => {
    const [actionState, setActionState] = useState<ActionStateWithData>({
        actionType: ActionTypeModal.CLOSE,
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
                return assertUnreachable(resourceType);
        }
    }, [moveChart, moveDashboard, resourceType]);

    useEffect(() => {
        if (
            actionState.actionType === ActionTypeModal.MOVE_TO_SPACE &&
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
                    />
                ) : (
                    <ResourceTable
                        resourceType={resourceType}
                        resourceIcon={resourceIcon}
                        resourceList={resourceList}
                        showSpaceColumn={showSpaceColumn}
                        enableSorting={enableSorting}
                        getURL={getURL}
                        onChangeAction={setActionState}
                    />
                )}
            </ResourceListWrapper>

            {actionState.actionType === ActionTypeModal.UPDATE &&
                (resourceType === 'chart' ? (
                    <UpdateActionModal
                        useActionModalState={[actionState, setActionState]}
                        useUpdate={actions.update}
                        ModalContent={SavedQueryForm}
                    />
                ) : (
                    <UpdateActionModal
                        useActionModalState={[actionState, setActionState]}
                        useUpdate={actions.update}
                        ModalContent={DashboardForm}
                    />
                ))}
            {actionState.actionType === ActionTypeModal.DELETE &&
                actionState.data && (
                    <DeleteActionModal
                        isOpen={
                            actionState.actionType === ActionTypeModal.DELETE
                        }
                        onClose={() => {
                            setActionState({
                                actionType: ActionTypeModal.CLOSE,
                            });
                        }}
                        uuid={actionState.data.uuid}
                        name={actionState.data.name}
                        isChart={resourceType === 'chart'}
                    />
                )}

            {actionState.actionType === ActionTypeModal.ADD_TO_DASHBOARD && (
                <AddTilesToDashboardModal
                    savedChart={actionState.data}
                    isOpen={
                        actionState.actionType ===
                        ActionTypeModal.ADD_TO_DASHBOARD
                    }
                    onClose={() =>
                        setActionState({ actionType: ActionTypeModal.CLOSE })
                    }
                />
            )}

            {actionState.actionType === ActionTypeModal.CREATE_SPACE &&
                actionState.data && (
                    <CreateSpaceModal
                        isOpen={
                            actionState.actionType ===
                            ActionTypeModal.CREATE_SPACE
                        }
                        onCreated={(space: Space) => {
                            if (actionState.data)
                                actions.moveToSpace({
                                    uuid: actionState.data.uuid,
                                    name: actionState.data.name,
                                    spaceUuid: space.uuid,
                                });

                            setActionState({
                                actionType: ActionTypeModal.CLOSE,
                            });
                        }}
                        onClose={() =>
                            setActionState({
                                actionType: ActionTypeModal.CLOSE,
                            })
                        }
                    />
                )}
        </>
    );
};

export default ResourceList;
