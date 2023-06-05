import { subject } from '@casl/ability';
import { PinnedItems, ResourceViewItemType, DashboardBasicDetails, SpaceQuery } from '@lightdash/common';
import { Card, Group, Text } from '@mantine/core';
import { IconPin } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';
import MantineLinkButton from '../common/MantineLinkButton';
import ResourceView, { ResourceViewType } from '../common/ResourceView';

interface Props {
    data: PinnedItems;
    projectUuid: string;
    pinnedListUuid: string;
    organizationUuid: string;
    dashboards: DashboardBasicDetails[];
    savedCharts: SpaceQuery[];
}

const PinnedItemsPanel: FC<Props> = ({
    data,
    projectUuid,
    pinnedListUuid,
    organizationUuid,
    dashboards,
    savedCharts,
}) => {
    const { user } = useApp();
    const userCanManagePinnedItems = user.data?.ability.can(
        'manage',
        subject('PinnedItems', { organizationUuid, projectUuid }),
    );

    const enablePinnedPanel = dashboards.length + savedCharts.length > 0;
    
    return data && data.length > 0 ? (
        <ResourceView
            items={data}
            view={ResourceViewType.GRID}
            hasReorder={userCanManagePinnedItems}
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
                title: userCanManagePinnedItems
                    ? 'Pinned items'
                    : 'Pinned for you',
                description: userCanManagePinnedItems
                    ? 'Pin Spaces, Dashboards and Charts to the top of the homepage to guide your business users to the right content.'
                    : 'Your data team have pinned these items to help guide you towards the most relevant content!',
            }}
            pinnedItemsProps={{ projectUuid, pinnedListUuid }}
        />
    ) : ((userCanManagePinnedItems && data.length <= 0) || !data) && enablePinnedPanel ? (
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
                        size="lg"
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
