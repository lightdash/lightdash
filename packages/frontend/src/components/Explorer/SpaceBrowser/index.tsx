import { Button, Colors, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import LatestCard from '../../Home/LatestCard';
import { CreateSpaceModal } from './CreateSpaceModal';
import {
    CreateNewButton,
    SpaceBrowserWrapper,
    SpaceFooter,
    SpaceHeader,
    SpaceItemCount,
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
                                <SpaceHeader>
                                    <Icon
                                        icon="folder-close"
                                        size={20}
                                        color={Colors.BLUE5}
                                    ></Icon>
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
                                </SpaceHeader>
                                <SpaceTitle ellipsize>{name}</SpaceTitle>
                                <SpaceFooter>
                                    <SpaceItemCount icon="control" value={5} />
                                    <SpaceItemCount
                                        icon="timeline-bar-chart"
                                        value={10}
                                    />
                                </SpaceFooter>
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
