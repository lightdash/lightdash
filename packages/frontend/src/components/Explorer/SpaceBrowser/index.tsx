import { AnchorButton, Button } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import {
    LightdashMode,
    ResourceViewItemType,
    spaceToResourceViewItem,
    wrapResourceView,
} from '@lightdash/common';
import { IconFolders } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import ResourceView, { ResourceViewType } from '../../common/ResourceView';
import SpaceActionModal, { ActionType } from '../../common/SpaceActionModal';

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { user, health } = useApp();
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

    if (isLoading) return null;

    return (
        <>
            <ResourceView
                view={ResourceViewType.GRID}
                items={wrapResourceView(
                    spaces.map(spaceToResourceViewItem),
                    ResourceViewItemType.SPACE,
                )}
                headerProps={{
                    title: 'Spaces',

                    action:
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
                                onClick={handleCreateSpace}
                            >
                                Create new
                            </Button>
                        ) : null,
                }}
                emptyStateProps={{
                    icon: <IconFolders size={30} />,
                    title: 'No spaces added yet',
                    action:
                        !isDemo && userCanManageSpace ? (
                            <Button
                                text="Create space"
                                icon="plus"
                                intent="primary"
                                onClick={handleCreateSpace}
                            />
                        ) : undefined,
                }}
            />

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
        </>
    );
};

export default SpaceBrowser;
