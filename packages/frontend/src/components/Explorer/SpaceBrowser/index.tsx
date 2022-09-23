import { AnchorButton, Button, Intent } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import ResourceEmptyState from '../../common/ResourceList/ResourceEmptyState';
import ResourceListWrapper from '../../common/ResourceList/ResourceListWrapper';
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

    const handleCreateSpace = () => {
        setIsCreateModalOpen(true);
    };

    return (
        <ResourceListWrapper
            headerTitle="Spaces"
            showCount={false}
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
        >
            {spaces.length === 0 ? (
                <ResourceEmptyState
                    resourceType="space"
                    resourceIcon="folder-close"
                    onClickCTA={
                        !isDemo && userCanManageSpace
                            ? handleCreateSpace
                            : undefined
                    }
                />
            ) : (
                <SpaceListWrapper>
                    {spaces.map(({ uuid, name, dashboards, queries }) => (
                        <SpaceItem
                            key={uuid}
                            projectUuid={projectUuid}
                            uuid={uuid}
                            name={name}
                            dashboardsCount={dashboards.length}
                            queriesCount={queries.length}
                            onRename={() => setUpdateSpaceUuid(uuid)}
                            onDelete={() => setDeleteSpaceUuid(uuid)}
                        />
                    ))}
                </SpaceListWrapper>
            )}

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

            {updateSpaceUuid && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    spaceUuid={updateSpaceUuid}
                    actionType={ActionType.UPDATE}
                    title="Update space"
                    confirmButtonLabel="Update"
                    icon="folder-close"
                    onClose={() => setUpdateSpaceUuid(undefined)}
                />
            )}

            {deleteSpaceUuid && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    spaceUuid={deleteSpaceUuid}
                    actionType={ActionType.DELETE}
                    title="Delete space"
                    confirmButtonLabel="Delete"
                    confirmButtonIntent={Intent.DANGER}
                    icon="folder-close"
                    onClose={() => setDeleteSpaceUuid(undefined)}
                />
            )}
        </ResourceListWrapper>
    );
};

export default SpaceBrowser;
