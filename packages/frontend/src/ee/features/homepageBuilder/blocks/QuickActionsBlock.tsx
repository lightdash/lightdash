import { ContentType, type HomepageQuickAction } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Menu,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowLeft,
    IconArrowRight,
    IconFolder,
    IconLayoutDashboard,
    IconPlus,
    IconSparkles,
    IconTable,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { useInfiniteContent } from '../../../../hooks/useContent';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAiAgentButtonVisibility } from '../../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { IconSquare } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

type StaticActionDefinition = {
    icon: Icon;
    title: string;
    description: string;
    url: (projectUuid: string) => string;
};

const STATIC_ACTIONS: Record<
    Exclude<HomepageQuickAction['type'], 'dashboard'>,
    StaticActionDefinition
> = {
    'ask-ai': {
        icon: IconSparkles,
        title: 'Ask AI',
        description: 'Ask a question in plain English.',
        url: (projectUuid) => `/projects/${projectUuid}/ai-agents`,
    },
    'run-query': {
        icon: IconTable,
        title: 'Run a query',
        description: 'Explore your data and answer a business question.',
        url: (projectUuid) => `/projects/${projectUuid}/tables`,
    },
    'browse-dashboards': {
        icon: IconLayoutDashboard,
        title: 'Browse dashboards',
        description: 'See what your team has already built.',
        url: (projectUuid) => `/projects/${projectUuid}/dashboards`,
    },
    'browse-spaces': {
        icon: IconFolder,
        title: 'Browse spaces',
        description: 'Content organized by team and topic.',
        url: (projectUuid) => `/projects/${projectUuid}/spaces`,
    },
};

const actionPresentation = (
    action: HomepageQuickAction,
    projectUuid: string,
): Omit<StaticActionDefinition, 'url'> & { url: string } => {
    if (action.type === 'dashboard') {
        return {
            icon: IconLayoutDashboard,
            title: action.label,
            description: 'Open this dashboard.',
            url: `/projects/${projectUuid}/dashboards/${action.dashboardUuid}/view`,
        };
    }
    const { url, ...definition } = STATIC_ACTIONS[action.type];
    return { ...definition, url: url(projectUuid) };
};

export const QuickActionCards: FC<{
    actions: HomepageQuickAction[];
    projectUuid: string;
}> = ({ actions, projectUuid }) => {
    const { track } = useTracking();
    const isAiEnabled = useAiAgentButtonVisibility();
    const visibleActions = actions.filter(
        (action) => action.type !== 'ask-ai' || isAiEnabled,
    );
    if (visibleActions.length === 0) return null;
    return (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {visibleActions.map((action, index) => {
                const presentation = actionPresentation(action, projectUuid);
                return (
                    <Anchor
                        key={`${action.type}-${index}`}
                        component={Link}
                        to={presentation.url}
                        underline="never"
                        c="inherit"
                        onClick={() =>
                            track({
                                name: EventName.HOMEPAGE_QUICK_ACTION_CLICKED,
                                properties: { actionType: action.type },
                            })
                        }
                    >
                        <Box
                            className={`${classes.hoverCard} ${classes.clickable}`}
                            p={18}
                            h="100%"
                        >
                            <IconSquare icon={presentation.icon} size="lg" />
                            <Text fw={600} fz={15} mt={13} mb={3}>
                                {presentation.title}
                            </Text>
                            <Text fz={13} c="dimmed" lh={1.45}>
                                {presentation.description}
                            </Text>
                        </Box>
                    </Anchor>
                );
            })}
        </SimpleGrid>
    );
};

const DashboardPickerModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onPick: (dashboardUuid: string, label: string) => void;
}> = ({ opened, onClose, projectUuid, onPick }) => {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const { data, isFetching } = useInfiniteContent(
        {
            projectUuids: [projectUuid],
            contentTypes: [ContentType.DASHBOARD],
            search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
            pageSize: 25,
        },
        { enabled: opened, keepPreviousData: true },
    );
    const results = (data?.pages ?? []).flatMap((page) => page.data);
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Pick a dashboard"
            size="lg"
        >
            <Stack gap="sm">
                <TextInput
                    placeholder="Search dashboards…"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    rightSection={isFetching ? <Loader size="xs" /> : null}
                />
                <Stack gap={4} mah={320} style={{ overflowY: 'auto' }}>
                    {results.map((content) => (
                        <Group
                            key={content.uuid}
                            gap="sm"
                            wrap="nowrap"
                            p="xs"
                            style={{ cursor: 'pointer', borderRadius: 8 }}
                            onClick={() => onPick(content.uuid, content.name)}
                        >
                            <MantineIcon
                                icon={IconLayoutDashboard}
                                color="gray"
                            />
                            <Text
                                size="sm"
                                fw={500}
                                style={{ flex: 1 }}
                                truncate
                            >
                                {content.name}
                            </Text>
                            <MantineIcon icon={IconPlus} color="gray" />
                        </Group>
                    ))}
                </Stack>
            </Stack>
        </MantineModal>
    );
};

export const QuickActionsBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'quick-actions') return null;
    return (
        <QuickActionCards
            actions={block.config.actions}
            projectUuid={projectUuid}
        />
    );
};

export const QuickActionsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const [isDashboardPickerOpen, setIsDashboardPickerOpen] = useState(false);
    if (block.type !== 'quick-actions') return null;

    const setActions = (actions: HomepageQuickAction[]) =>
        onChange({ ...block, config: { actions } });

    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= block.config.actions.length) return;
        const actions = [...block.config.actions];
        [actions[index], actions[target]] = [actions[target], actions[index]];
        setActions(actions);
    };

    const missingStatics = (
        Object.keys(STATIC_ACTIONS) as Array<keyof typeof STATIC_ACTIONS>
    ).filter(
        (type) => !block.config.actions.some((action) => action.type === type),
    );

    return (
        <Stack gap="xs">
            <Stack gap={4}>
                {block.config.actions.map((action, index) => {
                    const presentation = actionPresentation(
                        action,
                        projectUuid,
                    );
                    return (
                        <Group
                            key={`${action.type}-${index}`}
                            gap="xs"
                            wrap="nowrap"
                            p="xs"
                            style={{
                                border: '1px solid var(--mantine-color-gray-3)',
                                borderRadius: 8,
                            }}
                        >
                            <MantineIcon
                                icon={presentation.icon}
                                color="gray"
                            />
                            <Text size="sm" fw={500} style={{ flex: 1 }}>
                                {presentation.title}
                            </Text>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                disabled={index === 0}
                                aria-label={`Move ${presentation.title} earlier`}
                                onClick={() => move(index, -1)}
                            >
                                <MantineIcon icon={IconArrowLeft} />
                            </ActionIcon>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                disabled={
                                    index === block.config.actions.length - 1
                                }
                                aria-label={`Move ${presentation.title} later`}
                                onClick={() => move(index, 1)}
                            >
                                <MantineIcon icon={IconArrowRight} />
                            </ActionIcon>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label={`Remove ${presentation.title}`}
                                onClick={() =>
                                    setActions(
                                        block.config.actions.filter(
                                            (_, i) => i !== index,
                                        ),
                                    )
                                }
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Group>
                    );
                })}
            </Stack>
            <Group gap="xs">
                <Menu position="bottom-start">
                    <Menu.Target>
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            Add action
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {missingStatics.map((type) => (
                            <Menu.Item
                                key={type}
                                leftSection={
                                    <MantineIcon
                                        icon={STATIC_ACTIONS[type].icon}
                                    />
                                }
                                onClick={() =>
                                    setActions([
                                        ...block.config.actions,
                                        { type },
                                    ])
                                }
                            >
                                {STATIC_ACTIONS[type].title}
                            </Menu.Item>
                        ))}
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconLayoutDashboard} />
                            }
                            onClick={() => setIsDashboardPickerOpen(true)}
                        >
                            A specific dashboard…
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
                <Box>
                    <Text size="xs" c="dimmed">
                        Ask AI is hidden automatically for viewers without AI
                        access.
                    </Text>
                </Box>
            </Group>
            <DashboardPickerModal
                opened={isDashboardPickerOpen}
                onClose={() => setIsDashboardPickerOpen(false)}
                projectUuid={projectUuid}
                onPick={(dashboardUuid, label) => {
                    setActions([
                        ...block.config.actions,
                        { type: 'dashboard', dashboardUuid, label },
                    ]);
                    setIsDashboardPickerOpen(false);
                }}
            />
        </Stack>
    );
};
