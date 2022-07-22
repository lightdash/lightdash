import React, { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import LatestCard from '../../Home/LatestCard';
import { CreateSpaceModal } from './CreateSpaceModal';
import { DeleteSpaceModal } from './DeleteSpaceModal';
import { EditSpaceModal } from './EditSpaceModal';
import {
    CreateNewButton,
    FolderIcon,
    FolderWrapper,
    SpaceBrowserWrapper,
    SpaceLinkButton,
    SpaceListWrapper,
    SpaceTitle,
} from './SpaceBrowser.styles';
import { SpaceBrowserMenu } from './SpaceBrowserMenu';

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: spaces, isLoading } = useSpaces(projectUuid);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [updateSpaceUuid, setUpdateSpaceUuid] = useState<string>();
    const [deleteSpaceUuid, setDeleteSpaceUuid] = useState<string>();

    return (
        <SpaceBrowserWrapper>
            <LatestCard
                isLoading={isLoading}
                title="Browse spaces"
                headerAction={
                    <CreateNewButton
                        minimal
                        loading={isLoading}
                        intent="primary"
                        onClick={() => {
                            setIsCreateModalOpen(true);
                        }}
                    >
                        + Create new
                    </CreateNewButton>
                }
            >
                <SpaceListWrapper>
                    {spaces &&
                        spaces.map(({ uuid, name }) => (
                            <SpaceLinkButton
                                key={uuid}
                                minimal
                                outlined
                                href={`/projects/${projectUuid}/spaces/${uuid}`}
                            >
                                <FolderWrapper>
                                    <FolderIcon icon="folder-close"></FolderIcon>
                                </FolderWrapper>
                                <SpaceTitle>{name}</SpaceTitle>
                                <SpaceBrowserMenu
                                    spaceUuid={uuid}
                                    onDeleteSpace={setDeleteSpaceUuid}
                                    onUpdateSpace={setUpdateSpaceUuid}
                                />
                            </SpaceLinkButton>
                        ))}
                </SpaceListWrapper>
            </LatestCard>
            <CreateSpaceModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                }}
            ></CreateSpaceModal>

            {updateSpaceUuid && (
                <EditSpaceModal
                    spaceUuid={updateSpaceUuid}
                    onClose={() => {
                        setUpdateSpaceUuid(undefined);
                    }}
                ></EditSpaceModal>
            )}
            {deleteSpaceUuid && (
                <DeleteSpaceModal
                    spaceUuid={deleteSpaceUuid}
                    onClose={() => {
                        setDeleteSpaceUuid(undefined);
                    }}
                ></DeleteSpaceModal>
            )}
        </SpaceBrowserWrapper>
    );
};

export default SpaceBrowser;
