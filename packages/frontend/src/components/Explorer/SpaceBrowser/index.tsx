import {
    Button,
    Menu,
    MenuDivider,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
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

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isLoading } = useSpaces(projectUuid);

    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

    /*
    if (isLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading charts" icon={<Spinner />} />
            </div>
        );
    }*/

    /*  const dataList: SpaceBasicDetails[] = !data ? [] : data.map((space) => {
        const lastUpdatedChart = space.queries.reduce((acc, chart) =>
            chart && acc.updatedAt < chart.updatedAt ? acc : chart,
        );

        return {
            name: space.name,
            uuid: space.uuid,
            updatedAt: lastUpdatedChart.updatedAt,
            updatedByUser: lastUpdatedChart.updatedByUser,
        };
    });*/
    return (
        <SpaceBrowserWrapper>
            {/* <ActionCardList
                title="Browse spaces"
                useUpdate={useUpdateMutation}
                useDelete={useDeleteMutation()}
                dataList={dataList}
                getURL={(space: {uuid: string}) => {
                    return `/projects/${projectUuid}/spaces/${space.uuid}`;
                }}
                ModalContent={SpaceForm}
            />*/}

            <LatestCard
                isLoading={isLoading}
                title="Browse spaces"
                headerAction={
                    <CreateNewButton
                        minimal
                        loading={isLoading}
                        intent="primary"
                        onClick={
                            () => {
                                setIsModalOpen(true);
                            } /*() =>
                    useCreateMutation.mutate({
                        name: DEFAULT_DASHBOARD_NAME,
                    })*/
                        }
                    >
                        + Create new
                    </CreateNewButton>
                }
            >
                <SpaceListWrapper>
                    {data &&
                        data.map(({ uuid, name }) => (
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
                                <Popover2
                                    isOpen={isMenuOpen}
                                    onInteraction={setIsMenuOpen}
                                    content={
                                        <Menu>
                                            <MenuItem
                                                icon="edit"
                                                text="Rename"
                                                onClick={(e) => {
                                                    /*if (source === undefined) {
                                                            return;
                                                        }
                                                        e.stopPropagation();
                                                        onOpenSourceDialog(source);
                                                        setIsOpen(false);*/
                                                }}
                                            />
                                            <MenuDivider />

                                            <MenuItem
                                                icon="delete"
                                                intent="danger"
                                                text="Remove tile"
                                                onClick={
                                                    () => {}
                                                    /*onDelete(tile)
                                                     */
                                                }
                                            />
                                        </Menu>
                                    }
                                    position={PopoverPosition.BOTTOM_LEFT}
                                    lazy
                                >
                                    <Tooltip2 content="View options">
                                        <Button
                                            minimal
                                            icon="more"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setIsMenuOpen(true);
                                            }}
                                        />
                                    </Tooltip2>
                                </Popover2>
                            </SpaceLinkButton>
                        ))}
                </SpaceListWrapper>
            </LatestCard>
            <CreateSpaceModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                }}
            ></CreateSpaceModal>
        </SpaceBrowserWrapper>
    );
};

export default SpaceBrowser;
function setState<T>(arg0: boolean): { isModalOpen: any; setIsModalOpen: any } {
    throw new Error('Function not implemented.');
}
