import { subject } from '@casl/ability';
import {
    DashboardBasicDetails,
    ResourceViewItemType,
    Space,
    SpaceQuery,
    spaceToResourceViewItem,
    wrapResourceView,
} from '@lightdash/common';
import { Card, Group, Text } from '@mantine/core';
import { IconPin } from '@tabler/icons-react';
import React, { FC, useMemo } from 'react';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';
import MantineLinkButton from '../common/MantineLinkButton';
import ResourceView, { ResourceViewType } from '../common/ResourceView';

interface Props {
    data: {
        dashboards: DashboardBasicDetails[];
        savedCharts: SpaceQuery[];
        spaces: Space[];
    };
    projectUuid: string;
    organizationUuid: string;
}

const PinnedItemsPanel: FC<Props> = ({
    data,
    projectUuid,
    organizationUuid,
}) => {
    const { user } = useApp();
    const userCanUpdateProject = user.data?.ability.can(
        'update',
        subject('Project', { organizationUuid, projectUuid }),
    );

    const pinnedItems = useMemo(() => {
        return [
            ...wrapResourceView(
                data.dashboards,
                ResourceViewItemType.DASHBOARD,
            ),
            ...wrapResourceView(data.savedCharts, ResourceViewItemType.CHART),
            ...wrapResourceView(
                data.spaces.map(spaceToResourceViewItem),
                ResourceViewItemType.SPACE,
            ),
        ].filter((item) => {
            return !!item.data.pinnedListUuid;
        });
    }, [data]);

    return pinnedItems.length > 0 ? (
        <ResourceView
            items={pinnedItems}
            view={ResourceViewType.GRID}
            // hasReorder
            gridProps={{
                groups: [
                    [ResourceViewItemType.SPACE],
                    [
                        ResourceViewItemType.DASHBOARD,
                        ResourceViewItemType.CHART,
                    ],
                ],
            }}
            headerProps={{
                title: userCanUpdateProject ? 'Pinned items' : 'Pinned for you',
                description: userCanUpdateProject
                    ? 'Pin Spaces, Dashboards and Charts to the top of the homepage to guide your business users to the right content.'
                    : 'Your data team have pinned these items to help guide you towards the most relevant content!',
            }}
        />
    ) : userCanUpdateProject && pinnedItems.length <= 0 ? (
        // FIXME: update width with Mantine widths
        <Card
            withBorder
            sx={(theme) => ({
                backgroundColor: theme.colors.gray[1],
            })}
        >
            <Group position="apart">
                <Group position="center" spacing="xxs" my="xs" ml="xs">
                    <MantineIcon
                        icon={IconPin}
                        size={20}
                        color="gray.7"
                        fill="gray.1"
                    />
                    <Text fw={600} color="gray.7">
                        No Pinned items.
                    </Text>
                    <Text color="gray.7">
                        Pin items to the top of the homepage to guide users to
                        relevant content!
                    </Text>
                </Group>
                <MantineLinkButton
                    href="https://docs.lightdash.com/guides/pinning/"
                    target="_blank"
                    variant="subtle"
                    compact
                    color="gray.6"
                >
                    View docs
                </MantineLinkButton>
            </Group>
        </Card>
    ) : null;
};

export default PinnedItemsPanel;
