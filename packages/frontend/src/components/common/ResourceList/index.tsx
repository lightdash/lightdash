import { IconName, NonIdealState } from '@blueprintjs/core';
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
import {
    EmptyStateIcon,
    EmptyStateText,
    EmptyStateWrapper,
    ResourceListHeader,
    ResourceListWrapper,
    ResourceTag,
    Spacer,
    Title,
} from './ResourceList.styles';
import ResourceTable from './ResourceTable';

// TODO: create a subset of this type that only includes the fields we need
export type AcceptedResources = SpaceQuery | DashboardBasicDetails;
export type AcceptedResourceTypes = 'saved_chart' | 'dashboard';

export type ResourceListProps<T extends AcceptedResources = AcceptedResources> =
    {
        headerTitle: string;
        headerAction?: React.ReactNode;
        resourceList: T[];
        resourceType: AcceptedResourceTypes;
        resourceIcon: IconName;
        getURL: (data: T) => string;
    };

const getResourceLabel = (resourceType: AcceptedResourceTypes) => {
    switch (resourceType) {
        case 'dashboard':
            return 'dashboard';
        case 'saved_chart':
            return 'chart';
        default:
            throw new Error(`Unknown resource type: ${resourceType}`);
    }
};

interface ActionStateWithData {
    actionType: ActionTypeModal;
    data?: any;
}

const ResourceList: React.FC<ResourceListProps> = ({
    headerTitle,
    headerAction,
    resourceIcon,
    resourceList,
    resourceType,
    getURL,
}) => {
    const [actionState, setActionState] = useState<ActionStateWithData>({
        actionType: ActionTypeModal.CLOSE,
    });

    const { moveChart, moveDashboard } = useMoveToSpace(
        resourceType === 'saved_chart',
        actionState.data,
    );

    const actions = useMemo(() => {
        switch (resourceType) {
            case 'dashboard':
                return {
                    update: useUpdateDashboardName,
                    moveToSpace: moveDashboard,
                    ModalContent: DashboardForm,
                };
            case 'saved_chart':
                return {
                    update: useUpdateMutation,
                    moveToSpace: moveChart,
                    ModalContent: SavedQueryForm,
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
            <ResourceListWrapper>
                <ResourceListHeader>
                    <Title>{headerTitle}</Title>

                    {resourceList.length > 0 && (
                        <ResourceTag round>{resourceList.length}</ResourceTag>
                    )}

                    <Spacer />

                    {headerAction}
                </ResourceListHeader>

                {resourceList.length === 0 ? (
                    <EmptyStateWrapper>
                        <NonIdealState
                            description={
                                <EmptyStateWrapper>
                                    <EmptyStateIcon
                                        icon={resourceIcon}
                                        size={40}
                                    />
                                    <EmptyStateText>
                                        No {getResourceLabel(resourceType)}s
                                        added yet
                                    </EmptyStateText>
                                    <p>
                                        Hit <b>+</b> to get started.
                                    </p>
                                </EmptyStateWrapper>
                            }
                        />
                    </EmptyStateWrapper>
                ) : (
                    <ResourceTable
                        getURL={getURL}
                        onChangeAction={setActionState}
                        resourceType={resourceType}
                        resourceIcon={resourceIcon}
                        resourceList={resourceList}
                    />
                )}
            </ResourceListWrapper>

            {actionState.actionType === ActionTypeModal.UPDATE && (
                <UpdateActionModal
                    useActionModalState={[actionState, setActionState]}
                    useUpdate={actions.update}
                    ModalContent={actions.ModalContent}
                />
            )}
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
                        isChart={resourceType === 'saved_chart'}
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
