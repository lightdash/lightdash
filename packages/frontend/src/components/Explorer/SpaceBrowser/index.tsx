import { AnchorButton, Button } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useState } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import ResourceList, { ResourceViewType } from '../../common/ResourceView';
import {
    ResourceEmptyStateHeader,
    ResourceEmptyStateIcon,
} from '../../common/ResourceView/ResourceList.styles';
import {
    ResourceViewItemType,
    wrapResourceList,
} from '../../common/ResourceView/ResourceTypeUtils';
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

    return (
        <>
            <ResourceList
                view={ResourceViewType.GRID}
                items={wrapResourceList(spaces, ResourceViewItemType.SPACE)}
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
