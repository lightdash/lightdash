import { subject } from '@casl/ability';
import {
    ResourceViewItemType,
    spaceToResourceViewItem,
    wrapResourceView,
    type ResourceViewItem,
} from '@lightdash/common';
import { TextInput, Group, Stack, ActionIcon } from '@mantine-8/core';
import { IconFolders, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import MantineIcon from '../components/common/MantineIcon';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { ResourceSortDirection } from '../components/common/ResourceView/types';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useProject } from '../hooks/useProject';
import { useSpaceSummaries } from '../hooks/useSpaces';
import useApp from '../providers/App/useApp';

const MobileSpaces: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [], isInitialLoading: spaceIsLoading } =
        useSpaceSummaries(projectUuid, true);
    const project = useProject(projectUuid);
    const isLoading = spaceIsLoading || project.isInitialLoading;
    const { user } = useApp();
    const userCannotViewSpace = user.data?.ability?.cannot(
        'view',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            inheritsFromOrgOrProject: true,
        }),
    );
    const [search, setSearch] = useState<string>('');
    const visibleItems = useMemo(() => {
        const rootSpaces = spaces.filter(
            (space) => space.parentSpaceUuid === null,
        );
        const items = wrapResourceView(
            rootSpaces.map(spaceToResourceViewItem),
            ResourceViewItemType.SPACE,
        );
        if (search && search !== '') {
            const matchingItems: ResourceViewItem[] = [];
            new Fuse(items, {
                keys: ['data.name'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .forEach((res) => matchingItems.push(res.item));
            return matchingItems;
        }
        return items;
    }, [spaces, search]);

    if (userCannotViewSpace) {
        return <ForbiddenPanel />;
    }

    if (isLoading && !userCannotViewSpace) {
        return <EmptyStateLoader my="xl" title="Loading spaces" />;
    }

    return (
        <>
            <Stack gap="md" m="lg">
                <Group justify="space-between">
                    <PageBreadcrumbs
                        items={[
                            { to: '/home', title: 'Home' },
                            { title: 'All Spaces', active: true },
                        ]}
                    />
                </Group>
                <TextInput
                    leftSection={<MantineIcon icon={IconSearch} />}
                    rightSectionPointerEvents="all"
                    rightSection={
                        search ? (
                            <ActionIcon
                                aria-label="Clear search"
                                onMouseDown={(event) => event.preventDefault()}
                                variant="subtle"
                                color="gray"
                                onClick={() => setSearch('')}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        ) : null
                    }
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <ResourceView
                    items={visibleItems}
                    listProps={{
                        defaultSort: { updatedAt: ResourceSortDirection.DESC },
                        defaultColumnVisibility: {
                            space: false,
                            updatedAt: false,
                            actions: false,
                        },
                    }}
                    emptyStateProps={{
                        icon: <IconFolders size={30} />,
                        title: 'No spaces added yet',
                    }}
                />
            </Stack>
        </>
    );
};

export default MobileSpaces;
