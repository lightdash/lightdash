import { Button } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import LatestCard from '../../Home/LatestCard';
import { CreateSpaceModal } from './CreateSpaceModal';
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

    return (
        <SpaceBrowserWrapper>
            <LatestCard
                isLoading={isLoading}
                title="Spaces"
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
                                <div
                                    onClick={(e) => {
                                        // prevent clicks in menu to trigger redirect
                                        e.stopPropagation();
                                        e.preventDefault();
                                    }}
                                >
                                    <SpaceBrowserMenu spaceUuid={uuid}>
                                        <Tooltip2 content="View options">
                                            <Button minimal icon="more" />
                                        </Tooltip2>
                                    </SpaceBrowserMenu>
                                </div>
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
        </SpaceBrowserWrapper>
    );
};

export default SpaceBrowser;
