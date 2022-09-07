import { subject } from '@casl/ability';
import { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import LatestCard from '../../Home/LatestCard';
import { CreateSpaceModal } from './CreateSpaceModal';
import { DeleteSpaceModal } from './DeleteSpaceModal';
import { EditSpaceModal } from './EditSpaceModal';
import {
    CreateNewButton,
    SpaceBrowserWrapper,
    SpaceListWrapper,
} from './SpaceBrowser.styles';
import SpaceItem from './SpaceItem';

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { user } = useApp();
    const [updateSpaceUuid, setUpdateSpaceUuid] = useState<string>();
    const [deleteSpaceUuid, setDeleteSpaceUuid] = useState<string>();
    const { data: spaces, isLoading } = useSpaces(projectUuid);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

    return (
        <SpaceBrowserWrapper>
            <LatestCard
                isLoading={isLoading}
                title="Spaces"
                headerAction={
                    <Can
                        I="create"
                        this={subject('Space', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
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
                    </Can>
                }
            >
                <SpaceListWrapper>
                    {spaces?.map(({ uuid, name, dashboards, queries }) => (
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
            </LatestCard>

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
        </SpaceBrowserWrapper>
    );
};

export default SpaceBrowser;
