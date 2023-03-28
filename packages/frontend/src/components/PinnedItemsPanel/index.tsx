import { subject } from '@casl/ability';
import { Card, Group, Text, useMantineTheme } from '@mantine/core';
import { IconBook, IconInfoCircle, IconPin } from '@tabler/icons-react';
import React, { FC, useMemo } from 'react';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedCharts, useSpaces } from '../../hooks/useSpaces';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';
import MantineLinkButton from '../common/MantineLinkButton';
import ResourceView, { ResourceViewType } from '../common/ResourceView';
import {
    ResourceViewItemType,
    wrapResourceView,
} from '../common/ResourceView/resourceTypeUtils';

interface Props {
    projectUuid: string;
    organizationUuid: string;
}

const PinnedItemsPanel: FC<Props> = ({ projectUuid, organizationUuid }) => {
    const { user } = useApp();
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);
    const { data: spaces = [] } = useSpaces(projectUuid);

    const theme = useMantineTheme();
    const userCanUpdateProject = user.data?.ability.can(
        'update',
        subject('Project', { organizationUuid, projectUuid }),
    );

    const pinnedItems = useMemo(() => {
        return [
            ...wrapResourceView(dashboards, ResourceViewItemType.DASHBOARD),
            ...wrapResourceView(savedCharts, ResourceViewItemType.CHART),
            ...wrapResourceView(spaces, ResourceViewItemType.SPACE),
        ].filter((item) => {
            return !!item.data.pinnedListUuid;
        });
    }, [dashboards, savedCharts, spaces]);

    return pinnedItems.length > 0 ? (
        <ResourceView
            items={pinnedItems}
            view={ResourceViewType.GRID}
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
            w={900}
            withBorder
            style={{ backgroundColor: theme.colors.gray[1] }}
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
