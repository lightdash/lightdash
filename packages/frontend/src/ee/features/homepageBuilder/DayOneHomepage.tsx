import {
    ContentSortByColumns,
    ContentType,
    ResourceViewItemType,
    type ResourceViewItem,
    type SummaryContent,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconArrowUpRight,
    IconChartBar,
    IconFolder,
    IconLayoutDashboard,
    IconPin,
    IconSquareRoundedPlus,
    IconStar,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { ResourceIcon } from '../../../components/common/ResourceIcon';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { usePinnedItems } from '../../../hooks/pinning/usePinnedItems';
import { useInfiniteContent } from '../../../hooks/useContent';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import AiSearchBox from '../../components/Home/AiSearchBox';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../aiCopilot/components/AgentSelector/AgentSelectorUtils';
import { usePendingPrompt } from '../aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { BlockHeader } from './blocks/BlockShell';
import blockClasses from './blocks/blockStyles.module.css';
import { ContentCard } from './blocks/ContentCard';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';
import { QuickActionCards } from './blocks/QuickActionsBlock';
import classes from './DayOneHomepage.module.css';

const DAY_CHIPS = [
    'What drove revenue last month?',
    'Show me our top customers',
    'How are orders trending?',
];

const dayPart = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
};

type DiscoverGroupDefinition = {
    key: string;
    label: string;
    contentType: ContentType;
    browseUrl: (projectUuid: string) => string;
};

const DISCOVER_GROUPS: DiscoverGroupDefinition[] = [
    {
        key: 'dashboards',
        label: 'Dashboards',
        contentType: ContentType.DASHBOARD,
        browseUrl: (projectUuid) => `/projects/${projectUuid}/dashboards`,
    },
    {
        key: 'charts',
        label: 'Charts',
        contentType: ContentType.CHART,
        browseUrl: (projectUuid) => `/projects/${projectUuid}/saved`,
    },
    {
        key: 'spaces',
        label: 'Spaces',
        contentType: ContentType.SPACE,
        browseUrl: (projectUuid) => `/projects/${projectUuid}/spaces`,
    },
];

const useDiscoverContent = (projectUuid: string, contentType: ContentType) =>
    useInfiniteContent({
        projectUuids: [projectUuid],
        contentTypes: [contentType],
        pageSize: 6,
        sortBy: ContentSortByColumns.VIEWS,
        sortDirection: 'desc',
    });

const GroupSection: FC<{
    definition: DiscoverGroupDefinition;
    projectUuid: string;
    favoriteUuids: Set<string>;
    onToggleFavorite: (content: SummaryContent) => void;
}> = ({ definition, projectUuid, favoriteUuids, onToggleFavorite }) => {
    const { data, isInitialLoading } = useDiscoverContent(
        projectUuid,
        definition.contentType,
    );
    const items = (data?.pages ?? []).flatMap((page) => page.data);
    const total = data?.pages[0]?.pagination?.totalResults ?? 0;
    if (!isInitialLoading && total === 0) return null;
    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                    {definition.label}
                </Text>
                <Text size="xs" c="dimmed">
                    {total}
                </Text>
                <Box style={{ flex: 1 }} />
                <Anchor
                    component={Link}
                    to={definition.browseUrl(projectUuid)}
                    size="xs"
                    fw={500}
                >
                    Browse all
                </Anchor>
            </Group>
            {isInitialLoading ? (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} h={72} radius="md" />
                    ))}
                </SimpleGrid>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    {items.map((content) => (
                        <ContentCard
                            key={content.uuid}
                            content={content}
                            projectUuid={projectUuid}
                            star={{
                                isFavorite: favoriteUuids.has(content.uuid),
                                onToggle: () => onToggleFavorite(content),
                            }}
                        />
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
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
};

const ItemRow: FC<{ projectUuid: string; item: ResourceViewItem }> = ({
    projectUuid,
    item,
}) => (
    <Link
        to={itemUrl(projectUuid, item)}
        className={`${blockClasses.hoverCard} ${blockClasses.clickable} ${classes.itemRow}`}
    >
        <ResourceIcon item={item} />
        <Box style={{ minWidth: 0, flex: 1 }}>
            <div className={classes.itemName}>{item.data.name}</div>
            <div className={classes.itemMeta}>
                {ITEM_TYPE_LABELS[item.type] ?? 'Content'}
            </div>
        </Box>
    </Link>
);

const PersonalAndPinnedSections: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: project } = useProject(projectUuid);
    const { data: pinnedItems } = usePinnedItems(
        projectUuid,
        project?.pinnedListUuid,
    );
    const { data: favorites } = useFavorites(projectUuid);
    return (
        <Stack gap={34}>
            <Stack gap={0}>
                <BlockHeader
                    icon={IconStar}
                    iconColor="light-dark(#de7f0b, #e08a20)"
                    title="Your favourites"
                    pill="Only you"
                    mb={14}
                />
                {(favorites ?? []).length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={10}>
                        {(favorites ?? []).map((item) => (
                            <ItemRow
                                key={item.data.uuid}
                                projectUuid={projectUuid}
                                item={item}
                            />
                        ))}
                    </SimpleGrid>
                ) : (
                    <div
                        className={blockClasses.dashedEmpty}
                        style={{ padding: 16, borderRadius: 10 }}
                    >
                        Star any chart or dashboard to keep it here — visible
                        only to you.
                    </div>
                )}
            </Stack>
            {(pinnedItems ?? []).length > 0 && (
                <Stack gap={0}>
                    <BlockHeader
                        icon={IconPin}
                        title="Pinned"
                        pill="Pinned for everyone by admins"
                        mb={14}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={10}>
                        {(pinnedItems ?? []).map((item) => (
                            <ItemRow
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

const DayChips: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const navigate = useNavigate();
    const { setPendingPrompt } = usePendingPrompt();
    return (
        <Group gap={8} justify="center" mt={16}>
            {DAY_CHIPS.map((chip) => (
                <button
                    key={chip}
                    type="button"
                    className={classes.dayChip}
                    onClick={() => {
                        setPendingPrompt(chip);
                        void navigate(
                            {
                                pathname: `/projects/${projectUuid}/ai-agents`,
                                search: new URLSearchParams({
                                    [AI_ROUTING_SEARCH_PARAM]:
                                        AI_ROUTING_AUTO_VALUE,
                                }).toString(),
                            },
                            {
                                state: { autoSubmitPrompt: chip },
                                viewTransition: true,
                            },
                        );
                    }}
                >
                    <MantineIcon
                        icon={IconArrowUpRight}
                        size={14}
                        color="ldGray.5"
                    />
                    {chip}
                </button>
            ))}
        </Group>
    );
};

type Props = {
    projectUuid: string;
    projectName: string;
    adminSlot?: ReactNode;
};

export const DayOneHomepage: FC<Props> = ({
    projectUuid,
    projectName,
    adminSlot,
}) => {
    const { user } = useApp();
    const isAiEnabled = useAiAgentButtonVisibility();
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    const favoriteUuids = new Set(
        (favorites ?? []).map((item) => item.data.uuid),
    );

    const handleToggleFavorite = (content: SummaryContent) => {
        toggleFavorite({
            contentType: content.contentType,
            contentUuid: content.uuid,
        });
    };

    return (
        <Box>
            {isAiEnabled ? (
                <div className={classes.band}>
                    <div className={classes.bandInner}>
                        {adminSlot ? (
                            <Group justify="flex-end" mb={20} mt={-32}>
                                {adminSlot}
                            </Group>
                        ) : null}
                        <Text
                            component="h1"
                            fz={30}
                            fw={600}
                            lts="-0.025em"
                            lh={1.15}
                            ta="center"
                            m={0}
                            mb={26}
                        >
                            Good {dayPart()}, {user.data?.firstName}. What do
                            you want to know?
                        </Text>
                        <AiSearchBox projectUuid={projectUuid} />
                        <DayChips projectUuid={projectUuid} />
                    </div>
                </div>
            ) : (
                <div className={classes.container} style={{ paddingBottom: 0 }}>
                    {adminSlot ? (
                        <Group justify="flex-end" mb={16}>
                            {adminSlot}
                        </Group>
                    ) : null}
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

            <div className={classes.container}>
                <Stack gap="xl">
                    <PersonalAndPinnedSections projectUuid={projectUuid} />

                    <Stack gap="md">
                        <Box>
                            <Title order={4} fw={600}>
                                Explore your workspace
                            </Title>
                            <Text size="xs" c="dimmed">
                                Everything the data team has published, grouped
                                by type. Star anything to keep it handy.
                            </Text>
                        </Box>
                        <Group gap="xs">
                            <Button
                                variant={
                                    typeFilter === null ? 'filled' : 'default'
                                }
                                size="compact-xs"
                                onClick={() => setTypeFilter(null)}
                            >
                                All
                            </Button>
                            {DISCOVER_GROUPS.map((definition) => (
                                <Button
                                    key={definition.key}
                                    variant={
                                        typeFilter === definition.key
                                            ? 'filled'
                                            : 'default'
                                    }
                                    size="compact-xs"
                                    leftSection={
                                        <MantineIcon
                                            icon={
                                                definition.contentType ===
                                                ContentType.DASHBOARD
                                                    ? IconLayoutDashboard
                                                    : definition.contentType ===
                                                        ContentType.CHART
                                                      ? IconChartBar
                                                      : IconFolder
                                            }
                                        />
                                    }
                                    onClick={() =>
                                        setTypeFilter((current) =>
                                            current === definition.key
                                                ? null
                                                : definition.key,
                                        )
                                    }
                                >
                                    {definition.label}
                                </Button>
                            ))}
                        </Group>
                        {DISCOVER_GROUPS.filter(
                            (definition) =>
                                typeFilter === null ||
                                typeFilter === definition.key,
                        ).map((definition) => (
                            <GroupSection
                                key={definition.key}
                                definition={definition}
                                projectUuid={projectUuid}
                                favoriteUuids={favoriteUuids}
                                onToggleFavorite={handleToggleFavorite}
                            />
                        ))}
                    </Stack>
                </Stack>
            </div>
        </Box>
    );
};
