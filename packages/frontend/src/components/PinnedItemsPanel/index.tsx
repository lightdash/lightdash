import { ResourceViewItemType, type PinnedItems } from '@lightdash/common';
import { Box, Card, Group, Text } from '@mantine/core';
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

/**
 * Scope-tour marker for the pinned panel. Sits beside the `userCanManage`
 * check (manage:PinnedItems) so the walkthrough generator can find the
 * surface this scope unlocks. See scripts/scope-tours/generate.ts.
 */
const TOUR_MARKER = {
    'data-tour-scope': 'manage:PinnedItems',
    'data-tour-step': '1',
    'data-tour-route': '/projects/:projectUuid/home',
    'data-tour-label': 'Pinned content appears on the homepage',
    'data-tour-docs': 'explore/homepage.mdx#pin-content:1',
    'data-tour-resultdocs': 'explore/homepage.mdx#pin-content:p2:1',
} as const;

const PinnedItemsPanel: FC<Props> = ({ pinnedItems, isEnabled }) => {
    const { userCanManage } = usePinnedItemsContext();

    return pinnedItems && pinnedItems.length > 0 ? (
        <Box {...TOUR_MARKER}>
            {/* Inner surface: the same panel is the result of view:PinnedItems
                (reading what was pinned), one scope per element. */}
            <Box
                data-tour-scope="view:PinnedItems"
                data-tour-step="1"
                data-tour-route="/projects/:projectUuid/home"
                data-tour-label="Pinned content is where your data team wants you to start"
                data-tour-docs="explore/search.mdx#browsing-instead-of-searching:1-2"
                data-tour-return='[data-tour-nav="home"]'
                data-tour-resultdocs="explore/homepage.mdx#pin-content:1"
            >
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
                                ResourceViewItemType.DATA_APP,
                            ],
                        ],
                    }}
                    headerProps={{
                        title: userCanManage
                            ? 'Pinned items'
                            : 'Pinned for you',
                        description: userCanManage
                            ? 'Pin Spaces, Dashboards, Charts and Data apps to the top of the homepage to guide your business users to the right content.'
                            : 'Your data team have pinned these items to help guide you towards the most relevant content!',
                    }}
                />
            </Box>
        </Box>
    ) : ((userCanManage && pinnedItems.length <= 0) || !pinnedItems) &&
      isEnabled ? (
        <Card variant="dotted" {...TOUR_MARKER}>
            <Group justify="space-between">
                <Group justify="center" gap="xxs" my="xs" ml="xs">
                    <MantineIcon
                        icon={IconPin}
                        size={20}
                        color="ldGray.7"
                        fill="ldGray.1"
                    />
                    <Text fw={600} c="ldGray.8" fz="sm">
                        No pinned items.
                    </Text>
                    <Text c="dimmed" fz="sm">
                        Pin items to the top of the homepage to guide users to
                        relevant content.
                    </Text>
                </Group>
                <MantineLinkButton
                    href="https://docs.lightdash.com/guides/pinning/"
                    target="_blank"
                    variant="subtle"
                    size="compact-sm"
                >
                    View docs
                </MantineLinkButton>
            </Group>
        </Card>
    ) : null;
};

export default PinnedItemsPanel;
