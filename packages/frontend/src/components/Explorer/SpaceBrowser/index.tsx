import { AnchorButton, Button, Intent } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useCallback, useState } from 'react';
import { useSpacePinningMutation } from '../../../hooks/pinning/useSpaceMutation';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import ResourceList, { ResourceViewType } from '../../common/ResourceList';
import {
    ResourceEmptyStateHeader,
    ResourceEmptyStateIcon,
    ResourceEmptyStateWrapper,
} from '../../common/ResourceList/ResourceList.styles';
import ResourceListWrapper from '../../common/ResourceList/ResourceListWrapper';
import {
    ResourceListType,
    wrapResourceList,
} from '../../common/ResourceList/ResourceTypeUtils';
import SpaceActionModal, { ActionType } from '../../common/SpaceActionModal';
import { SpaceListWrapper } from './SpaceBrowser.styles';
import SpaceItem from './SpaceItem';

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const [updateSpaceUuid, setUpdateSpaceUuid] = useState<string>();
    const [deleteSpaceUuid, setDeleteSpaceUuid] = useState<string>();
    const { data: spaces = [], isLoading } = useSpaces(projectUuid);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanManageSpace = user.data?.ability?.can(
        'create',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const { mutate: pinSpace } = useSpacePinningMutation(projectUuid);

    const handleCreateSpace = () => {
        setIsCreateModalOpen(true);
    };

    const handlePinToggle = useCallback(
        (spaceUuid: string) => pinSpace(spaceUuid),
        [pinSpace],
    );

    return (
        <>
            <ResourceList
                view={ResourceViewType.GRID}
                items={wrapResourceList(spaces, ResourceListType.SPACE)}
                headerTitle="Spaces"
                headerAction={
                    spaces.length === 0 ? (
                        <AnchorButton
                            text="Learn"
                            minimal
                            target="_blank"
                            href="https://docs.lightdash.com/guides/spaces/"
                        />
                    ) : !isDemo && userCanManageSpace ? (
                        <Button
                            minimal
                            intent="primary"
                            icon="plus"
                            loading={isLoading}
                            onClick={handleCreateSpace}
                        >
                            Create new
                        </Button>
                    ) : null
                }
                showCount={false}
                renderEmptyState={() => (
                    <>
                        <ResourceEmptyStateIcon icon="folder-close" size={40} />

                        <ResourceEmptyStateHeader>
                            No spaces added yet
                        </ResourceEmptyStateHeader>

                        {!isDemo && userCanManageSpace && (
                            <Button
                                text="Create space"
                                icon="plus"
                                intent="primary"
                                onClick={handleCreateSpace}
                            />
                        )}
                    </>
                )}
            />

            <ResourceListWrapper headerTitle="Spaces" showCount={false}>
                <SpaceListWrapper>
                    {spaces.map(
                        ({
                            uuid,
                            name,
                            dashboards,
                            queries,
                            pinnedListUuid,
                        }) => (
                            <SpaceItem
                                key={uuid}
                                projectUuid={projectUuid}
                                uuid={uuid}
                                name={name}
                                isPinned={!!pinnedListUuid}
                                dashboardsCount={dashboards.length}
                                queriesCount={queries.length}
                                onRename={() => setUpdateSpaceUuid(uuid)}
                                onDelete={() => setDeleteSpaceUuid(uuid)}
                                onPinToggle={() => handlePinToggle(uuid)}
                            />
                        ),
                    )}
                </SpaceListWrapper>

                {isCreateModalOpen && (
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        actionType={ActionType.CREATE}
                        title="Create new space"
                        confirmButtonLabel="Create"
                        icon="folder-close"
                        onClose={() => setIsCreateModalOpen(false)}
                    />
                )}
            </ResourceListWrapper>
        </>
    );
};

export default SpaceBrowser;
