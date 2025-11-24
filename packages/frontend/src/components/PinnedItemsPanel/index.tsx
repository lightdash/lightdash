import { ResourceViewItemType, type PinnedItems } from '@lightdash/common';
import { Card, Group, Text } from '@mantine/core';
import { IconPin } from '@tabler/icons-react';
import { type FC } from 'react';
import usePinnedItemsContext from '../../providers/PinnedItems/usePinnedItemsContext';
import MantineIcon from '../common/MantineIcon';
import MantineLinkButton from '../common/MantineLinkButton';
import ResourceView from '../common/ResourceView';
import { ResourceViewType } from '../common/ResourceView/types';

interface Props {
    pinnedItems: PinnedItems;
    isEnabled: boolean;
}

const PinnedItemsPanel: FC<Props> = ({ pinnedItems, isEnabled }) => {
    const { userCanManage } = usePinnedItemsContext();

    return pinnedItems && pinnedItems.length > 0 ? (
        <ResourceView
            items={pinnedItems}
            view={ResourceViewType.GRID}
            hasReorder={userCanManage}
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
                title: userCanManage ? 'Pinned items' : 'Pinned for you',
                description: userCanManage
                    ? 'Pin Spaces, Dashboards and Charts to the top of the homepage to guide your business users to the right content.'
                    : 'Your data team have pinned these items to help guide you towards the most relevant content!',
            }}
        />
    ) : ((userCanManage && pinnedItems.length <= 0) || !pinnedItems) &&
      isEnabled ? (
        // FIXME: update width with Mantine widths
        <Card
            withBorder
            sx={(theme) => ({
                backgroundColor: theme.colors.ldGray[1],
            })}
        >
            <Group position="apart">
                <Group position="center" spacing="xxs" my="xs" ml="xs">
                    <MantineIcon
                        icon={IconPin}
                        size="lg"
                        color="ldGray.7"
                        fill="ldGray.1"
                    />
                    <Text fw={600} color="ldGray.7">
                        No Pinned items.
                    </Text>
                    <Text color="ldGray.7">
                        Pin items to the top of the homepage to guide users to
                        relevant content!
                    </Text>
                </Group>
                <MantineLinkButton
                    href="https://docs.lightdash.com/guides/pinning/"
                    target="_blank"
                    variant="subtle"
                    compact
                    color="ldGray.6"
                >
                    View docs
                </MantineLinkButton>
            </Group>
        </Card>
    ) : null;
};

export default PinnedItemsPanel;
