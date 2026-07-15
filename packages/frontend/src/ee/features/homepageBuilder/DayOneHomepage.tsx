import { ResourceViewItemType, type ResourceViewItem } from '@lightdash/common';
import { Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine-8/core';
import {
    IconCircleCheckFilled,
    IconEye,
    IconPin,
    IconSquareRoundedPlus,
    IconStar,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { ResourceIcon } from '../../../components/common/ResourceIcon';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { usePinnedItems } from '../../../hooks/pinning/usePinnedItems';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { BlockHeader } from './blocks/BlockShell';
import blockClasses from './blocks/blockStyles.module.css';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';
import { QuickActionCards } from './blocks/QuickActionsBlock';
import { DayOneAskInput } from './DayOneAskInput';
import classes from './DayOneHomepage.module.css';

const dayPart = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
};

const itemUrl = (projectUuid: string, item: ResourceViewItem): string => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUuid}/spaces/${item.data.uuid}`;
        default:
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
    }
};

const ITEM_TYPE_LABELS: Partial<Record<ResourceViewItemType, string>> = {
    [ResourceViewItemType.CHART]: 'Chart',
    [ResourceViewItemType.DASHBOARD]: 'Dashboard',
    [ResourceViewItemType.SPACE]: 'Space',
    [ResourceViewItemType.DATA_APP]: 'App',
};

const isVerified = (item: ResourceViewItem): boolean =>
    (item.type === ResourceViewItemType.CHART ||
        item.type === ResourceViewItemType.DASHBOARD) &&
    !!item.data.verification;

const viewCount = (item: ResourceViewItem): number | undefined =>
    item.type === ResourceViewItemType.SPACE ? undefined : item.data.views;

// Same tile recipe as the Collection block's ContentCard (icon, name +
// verified check, kind · views) so the personal layer reads as part of the
// same design system instead of a plain settings-style list.
const ItemTile: FC<{ projectUuid: string; item: ResourceViewItem }> = ({
    projectUuid,
    item,
}) => {
    const views = viewCount(item);
    return (
        <Link
            to={itemUrl(projectUuid, item)}
            className={`${blockClasses.hoverCard} ${blockClasses.clickable} ${classes.tile}`}
        >
            <ResourceIcon item={item} />
            <Group gap={5} wrap="nowrap" mt={10} mb={2}>
                <Text size="sm" fw={600} truncate>
                    {item.data.name}
                </Text>
                {isVerified(item) && (
                    <MantineIcon
                        icon={IconCircleCheckFilled}
                        size={15}
                        color="green"
                    />
                )}
            </Group>
            <Group gap={5} wrap="nowrap" className={classes.tileMeta}>
                <Text size="xs" c="dimmed" span>
                    {ITEM_TYPE_LABELS[item.type] ?? 'Content'}
                </Text>
                {views !== undefined && (
                    <>
                        <Text size="xs" c="dimmed" span>
                            ·
                        </Text>
                        <MantineIcon
                            icon={IconEye}
                            size={12}
                            color="ldGray.6"
                        />
                        <Text size="xs" c="dimmed" span>
                            {views}
                        </Text>
                    </>
                )}
            </Group>
        </Link>
    );
};

const PersonalAndPinnedSections: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: project } = useProject(projectUuid);
    const { data: pinnedItems } = usePinnedItems(
        projectUuid,
        project?.pinnedListUuid,
    );
    const { data: favorites } = useFavorites(projectUuid);
    if ((favorites ?? []).length === 0 && (pinnedItems ?? []).length === 0) {
        return null;
    }
    return (
        <Stack gap={28}>
            {(favorites ?? []).length > 0 && (
                <Stack gap={0}>
                    <BlockHeader
                        icon={IconStar}
                        iconColor="light-dark(#de7f0b, #e08a20)"
                        title="Your favourites"
                        pill="Only you"
                        mb={12}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={12}>
                        {(favorites ?? []).map((item) => (
                            <ItemTile
                                key={item.data.uuid}
                                projectUuid={projectUuid}
                                item={item}
                            />
                        ))}
                    </SimpleGrid>
                </Stack>
            )}
            {(pinnedItems ?? []).length > 0 && (
                <Stack gap={0}>
                    <BlockHeader
                        icon={IconPin}
                        title="Pinned"
                        pill="Pinned for everyone by admins"
                        mb={12}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={12}>
                        {(pinnedItems ?? []).map((item) => (
                            <ItemTile
                                key={item.data.uuid}
                                projectUuid={projectUuid}
                                item={item}
                            />
                        ))}
                    </SimpleGrid>
                </Stack>
            )}
        </Stack>
    );
};

type Props = {
    projectUuid: string;
    projectName: string;
};

export const DayOneHomepage: FC<Props> = ({ projectUuid, projectName }) => {
    const { user } = useApp();
    const isAiEnabled = useAiAgentButtonVisibility();

    return (
        <div className={classes.page}>
            {isAiEnabled ? (
                <div className={classes.hero}>
                    <Text
                        component="h1"
                        fz={30}
                        fw={600}
                        lts="-0.025em"
                        lh={1.15}
                        ta="center"
                        m={0}
                        mb={22}
                    >
                        Good {dayPart()}, {user.data?.firstName}. What do you
                        want to know?
                    </Text>
                    <Box w="100%">
                        <DayOneAskInput projectUuid={projectUuid} />
                    </Box>
                </div>
            ) : (
                <div className={classes.welcome}>
                    <Group
                        justify="space-between"
                        align="flex-end"
                        wrap="nowrap"
                        mb={26}
                    >
                        <Box>
                            <Text
                                component="h1"
                                fz={30}
                                fw={600}
                                lts="-0.02em"
                                m={0}
                            >
                                Welcome to {projectName}, {user.data?.firstName}
                            </Text>
                            <Text c="dimmed" fz={15} mt={6}>
                                Nothing’s here yet — start exploring, or your
                                data team can curate this page.
                            </Text>
                        </Box>
                        <Button
                            component={Link}
                            to={`/projects/${projectUuid}/tables`}
                            leftSection={
                                <MantineIcon icon={IconSquareRoundedPlus} />
                            }
                            style={{ flexShrink: 0 }}
                        >
                            New
                        </Button>
                    </Group>
                    <QuickActionCards
                        actions={getDefaultQuickActions(false)}
                        projectUuid={projectUuid}
                    />
                </div>
            )}

            <div className={classes.secondary}>
                <PersonalAndPinnedSections projectUuid={projectUuid} />
            </div>
        </div>
    );
};
