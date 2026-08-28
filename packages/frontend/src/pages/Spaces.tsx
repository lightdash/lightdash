import { subject } from '@casl/ability';
import { ContentType, LightdashMode } from '@lightdash/common';
import { Group, Stack, Button } from '@mantine/core';
import { IconFolderPlus, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { type ContentViewValue } from '../components/common/ResourceView/AdminContentViewFilter';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';
import SpaceActionModal from '../components/common/SpaceActionModal';
import { ActionType } from '../components/common/SpaceActionModal/types';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useDirectAccessAvailability } from '../features/directAccess';
import { useProjectUuid } from '../hooks/useProjectUuid';
import useSearchParams from '../hooks/useSearchParams';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';
import styles from './Spaces.module.css';

const Spaces: FC = () => {
    const projectUuid = useProjectUuid()!;

    const { user, health } = useApp();
    const navigate = useNavigate();
    const viewParam = useSearchParams('view');
    const directAccessAvailability = useDirectAccessAvailability();

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

    const withSharedWithMe = directAccessAvailability.isAvailable;
    const withAdminView = userCanManageProject === true;

    // URL is the source of truth so /spaces?view=shared-with-me deep links work
    const view: ContentViewValue =
        viewParam === 'shared-with-me' && withSharedWithMe
            ? 'shared-with-me'
            : viewParam === 'all' && withAdminView
              ? 'all'
              : 'shared';
    const setView = (newView: ContentViewValue) => {
        void navigate(
            { search: newView === 'shared' ? '' : `?view=${newView}` },
            { replace: true },
        );
    };

    if (
        user.data?.ability?.cannot(
            'view',
            subject('Space', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject: true,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    const isSharedWithMe = view === 'shared-with-me';
    const contentViewProps = {
        value: view,
        onChange: setView,
        withSharedWithMe,
        withAdminView,
    };

    return (
        <FavoritesProvider projectUuid={projectUuid}>
            <Page
                title="Spaces"
                withCenteredRoot
                withCenteredContent
                withXLargePaddedContent
                withLargeContent
            >
                <Stack gap="xxl" w="100%">
                    <Group justify="space-between">
                        <PageBreadcrumbs
                            items={[
                                { to: '/home', title: 'Home' },
                                { title: 'Spaces', active: true },
                            ]}
                        />

                        <Group gap="xs">
                            {!isDemo && userCanManageSpace && (
                                <Button
                                    leftSection={<IconPlus size={18} />}
                                    onClick={handleCreateSpace}
                                    className={
                                        isSharedWithMe
                                            ? styles.hiddenAction
                                            : undefined
                                    }
                                    aria-hidden={isSharedWithMe}
                                    tabIndex={isSharedWithMe ? -1 : undefined}
                                >
                                    Add
                                </Button>
                            )}
                        </Group>
                    </Group>
                    {isSharedWithMe ? (
                        <InfiniteResourceTable
                            key="shared-with-me"
                            filters={{
                                projectUuid,
                                spaceUuids: [],
                                contentTypes: [
                                    ContentType.DASHBOARD,
                                    ContentType.CHART,
                                    ContentType.DATA_APP,
                                ],
                                sharedWithMe: true,
                            }}
                            columnVisibility={{
                                [ColumnVisibility.SPACE]: false,
                                [ColumnVisibility.UPDATED_AT]: true,
                                [ColumnVisibility.VIEWS]: true,
                                [ColumnVisibility.ACCESS]: false,
                                [ColumnVisibility.CONTENT]: false,
                            }}
                            contentView={contentViewProps}
                            enableBottomToolbar={false}
                            enableRowSelection={false}
                            emptyState={{
                                title: 'Nothing has been shared with you yet.',
                            }}
                        />
                    ) : (
                        <InfiniteResourceTable
                            key="spaces"
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
                                [ColumnVisibility.VIEWS]: false,
                                [ColumnVisibility.ACCESS]: true,
                                [ColumnVisibility.CONTENT]: true,
                            }}
                            contentView={contentViewProps}
                            enableBottomToolbar={false}
                            enableRowSelection={userCanManageSpace}
                        />
                    )}

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
        </FavoritesProvider>
    );
};

export default Spaces;
