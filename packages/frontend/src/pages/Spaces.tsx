import { subject } from '@casl/ability';
import { ContentType, LightdashMode } from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconFolderPlus, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useParams } from 'react-router';

import ForbiddenPanel from '../components/ForbiddenPanel';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';

import SpaceActionModal from '../components/common/SpaceActionModal';
import { ActionType } from '../components/common/SpaceActionModal/types';

import useApp from '../providers/App/useApp';

const Spaces: FC = () => {
    const { projectUuid } = useParams() as {
        projectUuid: string;
    };

    const { user, health } = useApp();

    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const handleCreateSpace = () => {
        setIsCreateModalOpen(true);
    };

    const userCanManageSpace = user.data?.ability?.can(
        'create',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: projectUuid,
        }),
    );

    if (
        user.data?.ability?.cannot(
            'view',
            subject('Space', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
                isPrivate: false,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    return (
        <Page
            title="Spaces"
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack spacing="xxl" w="100%">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            { to: '/home', title: 'Home' },
                            { title: 'Spaces', active: true },
                        ]}
                    />

                    <Group spacing="xs">
                        {!isDemo && userCanManageSpace && (
                            <Button
                                leftIcon={<IconPlus size={18} />}
                                onClick={handleCreateSpace}
                            >
                                Add
                            </Button>
                        )}
                    </Group>
                </Group>
                <InfiniteResourceTable
                    filters={{
                        projectUuid,
                        spaceUuids: [],
                        contentTypes: [ContentType.SPACE],
                    }}
                    contentTypeFilter={{
                        defaultValue: ContentType.SPACE,
                        options: [],
                    }}
                    columnVisibility={{
                        [ColumnVisibility.SPACE]: false,
                        [ColumnVisibility.UPDATED_AT]: false,
                        [ColumnVisibility.ACCESS]: true,
                        [ColumnVisibility.CONTENT]: true,
                    }}
                    adminContentView={userCanManageProject}
                    enableBottomToolbar={false}
                    enableRowSelection={userCanManageSpace}
                />

                {isCreateModalOpen && (
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        parentSpaceUuid={null}
                        actionType={ActionType.CREATE}
                        title="Create new space"
                        confirmButtonLabel="Create"
                        icon={IconFolderPlus}
                        onClose={() => setIsCreateModalOpen(false)}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default Spaces;
