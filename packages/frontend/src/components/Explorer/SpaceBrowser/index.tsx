import { AnchorButton, Button } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import ResourceEmptyState from '../../common/ResourceList/ResourceEmptyState';
import ResourceListWrapper from '../../common/ResourceList/ResourceListWrapper';
import { CreateSpaceModal } from './CreateSpaceModal';
import { DeleteSpaceModal } from './DeleteSpaceModal';
import { EditSpaceModal } from './EditSpaceModal';
import { SpaceListWrapper } from './SpaceBrowser.styles';
import SpaceItem from './SpaceItem';

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const [updateSpaceUuid, setUpdateSpaceUuid] = useState<string>();
    const [deleteSpaceUuid, setDeleteSpaceUuid] = useState<string>();
    const { data: spaces = [], isLoading } = useSpaces(projectUuid);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const isDemo = health.data?.mode === LightdashMode.DEMO;

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
                ) : !isDemo ? (
                    <Can
                        I="create"
                        this={subject('Space', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button
                            minimal
                            intent="primary"
                            icon="plus"
                            loading={isLoading}
                            onClick={handleCreateSpace}
                        >
                            Create new
                        </Button>
                    </Can>
                ) : null
            }
        >
            {spaces.length === 0 ? (
                <ResourceEmptyState
                    resourceType="space"
                    onClickCTA={handleCreateSpace}
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

            <CreateSpaceModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                }}
            />

            {updateSpaceUuid && (
                <EditSpaceModal
                    spaceUuid={updateSpaceUuid}
                    onClose={() => {
                        setUpdateSpaceUuid(undefined);
                    }}
                />
            )}

            {deleteSpaceUuid && (
                <DeleteSpaceModal
                    spaceUuid={deleteSpaceUuid}
                    onClose={() => {
                        setDeleteSpaceUuid(undefined);
                    }}
                />
            )}
        </ResourceListWrapper>
    );
};

export default SpaceBrowser;
