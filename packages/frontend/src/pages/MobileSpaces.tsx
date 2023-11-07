import { subject } from '@casl/ability';
import {
    ResourceViewItem,
    ResourceViewItemType,
    spaceToResourceViewItem,
    wrapResourceView,
} from '@lightdash/common';
import { ActionIcon, Group, Stack, TextInput } from '@mantine/core';
import { IconFolders, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { FC, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useProject } from '../hooks/useProject';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const MobileSpaces: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [], isLoading: spaceIsLoading } = useSpaceSummaries(
        projectUuid,
        true,
    );
    const project = useProject(projectUuid);
    const isLoading = spaceIsLoading || project.isLoading;
    const { user } = useApp();
    const userCannotViewSpace = user.data?.ability?.cannot(
        'view',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const [search, setSearch] = useState<string>('');
    const visibleItems = useMemo(() => {
        const items = wrapResourceView(
            spaces.map(spaceToResourceViewItem),
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
        return <LoadingState title="Loading spaces" />;
    }

    return (
        <>
            <Stack spacing="md" m="lg">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            { to: '/home', title: 'Home' },
                            { title: 'All Spaces', active: true },
                        ]}
                    />
                </Group>
                <TextInput
                    icon={<MantineIcon icon={IconSearch} />}
                    rightSection={
                        search ? (
                            <ActionIcon onClick={() => setSearch('')}>
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
                        defaultSort: { updatedAt: SortDirection.DESC },
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
