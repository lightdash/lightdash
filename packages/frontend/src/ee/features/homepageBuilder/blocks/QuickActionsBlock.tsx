import { ContentType, type HomepageQuickAction } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Menu,
    Paper,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowLeft,
    IconArrowRight,
    IconFolder,
    IconInfoCircle,
    IconLayoutDashboard,
    IconPlus,
    IconSparkles,
    IconStar,
    IconStarFilled,
    IconTable,
    IconUserCircle,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { useInfiniteContent } from '../../../../hooks/useContent';
import { useProjectUrlIdentifier } from '../../../../hooks/useProjectRoute';
import { usePersonalSpace } from '../../../../hooks/useSpaces';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useHomepageAiState } from '../hooks/useHomepageAiState';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

type StaticActionDefinition = {
    icon: Icon;
    title: string;
    description: string;
    url: (projectUuid: string) => string;
};

const STATIC_ACTIONS: Record<
    Exclude<HomepageQuickAction['type'], 'dashboard' | 'space'>,
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
    'my-space': {
        icon: IconUserCircle,
        title: 'My space',
        description: 'Your personal space.',
        // Resolved per viewer at render time; the chip is hidden without one.
        url: (projectUuid) => `/projects/${projectUuid}/spaces`,
    },
};

const STATIC_ACTION_HINTS: Partial<
    Record<keyof typeof STATIC_ACTIONS, string>
> = {
    'ask-ai': 'Hidden automatically for viewers without AI access.',
    'my-space': 'Only shown to viewers who have a personal space.',
};

const actionKey = (action: HomepageQuickAction): string => {
    switch (action.type) {
        case 'dashboard':
            return `dashboard-${action.dashboardUuid}`;
        case 'space':
            return `space-${action.spaceUuid}`;
        default:
            return action.type;
    }
};

const actionPresentation = (
    action: HomepageQuickAction,
    projectUuid: string,
    projectUrlIdentifier = projectUuid,
): Omit<StaticActionDefinition, 'url'> & { url: string } => {
    if (action.type === 'dashboard') {
        return {
            icon: IconLayoutDashboard,
            title: action.label,
            description: 'Open this dashboard.',
            url: `/projects/${projectUrlIdentifier}/dashboards/${action.dashboardUuid}/view`,
        };
    }
    if (action.type === 'space') {
        return {
            icon: IconFolder,
            title: action.label,
            description: 'Open this space.',
            url: `/projects/${projectUrlIdentifier}/spaces/${action.spaceUuid}`,
        };
    }
    const { url, ...definition } = STATIC_ACTIONS[action.type];
    const identifier =
        action.type === 'browse-dashboards' || action.type === 'browse-spaces'
            ? projectUrlIdentifier
            : projectUuid;
    return { ...definition, url: url(identifier) };
};

const chipClassName = (action: HomepageQuickAction): string =>
    `${classes.quickActionChip}${
        action.primary ? ` ${classes.quickActionChipPrimary}` : ''
    }`;

export const QuickActionCards: FC<{
    actions: HomepageQuickAction[];
    projectUuid: string;
    // Centred under the composer; left-aligned when it follows a page heading
    justify?: 'center' | 'flex-start';
    personalPlaceholders?: boolean;
}> = ({
    actions,
    projectUuid,
    justify = 'center',
    personalPlaceholders = false,
}) => {
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const { track } = useTracking();
    const { canAskAi } = useHomepageAiState(projectUuid);
    const hasMySpaceAction = actions.some(
        (action) => action.type === 'my-space',
    );
    const personalSpace = usePersonalSpace(projectUuid, {
        enabled: hasMySpaceAction && !personalPlaceholders,
    });
    const visibleActions = actions.filter((action) => {
        switch (action.type) {
            case 'ask-ai':
                return canAskAi;
            case 'my-space':
                return personalPlaceholders || !!personalSpace.data;
            default:
                return true;
        }
    });
    if (visibleActions.length === 0) return null;
    return (
        <Group gap={8} justify={justify}>
            {visibleActions.map((action) => {
                const presentation = actionPresentation(
                    action,
                    projectUuid,
                    projectUrlIdentifier,
                );
                const icon = (
                    <MantineIcon
                        icon={presentation.icon}
                        size={14}
                        color={action.primary ? 'inherit' : 'ldGray.6'}
                    />
                );
                if (action.type === 'my-space' && personalPlaceholders) {
                    return (
                        <Tooltip
                            key={actionKey(action)}
                            label="Resolves to each viewer's own personal space."
                        >
                            <span
                                className={chipClassName(action)}
                                data-placeholder
                            >
                                {icon}
                                {presentation.title}
                            </span>
                        </Tooltip>
                    );
                }
                const url =
                    action.type === 'my-space' && personalSpace.data
                        ? `/projects/${projectUrlIdentifier}/spaces/${personalSpace.data.uuid}`
                        : presentation.url;
                const trackClick = () =>
                    track({
                        name: EventName.HOMEPAGE_QUICK_ACTION_CLICKED,
                        properties: { actionType: action.type },
                    });
                // The primary action is the same chip, inverted.
                return (
                    <Anchor
                        key={actionKey(action)}
                        component={Link}
                        to={url}
                        underline="never"
                        className={chipClassName(action)}
                        onClick={trackClick}
                    >
                        {icon}
                        {presentation.title}
                    </Anchor>
                );
            })}
        </Group>
    );
};

type PickableContentType = ContentType.DASHBOARD | ContentType.SPACE;

const PICKER_COPY: Record<
    PickableContentType,
    { title: string; placeholder: string; icon: Icon }
> = {
    [ContentType.DASHBOARD]: {
        title: 'Pick a dashboard',
        placeholder: 'Search dashboards…',
        icon: IconLayoutDashboard,
    },
    [ContentType.SPACE]: {
        title: 'Pick a space',
        placeholder: 'Search spaces…',
        icon: IconFolder,
    },
};

const ContentPickerModal: FC<{
    contentType: PickableContentType | null;
    onClose: () => void;
    projectUuid: string;
    onPick: (uuid: string, label: string) => void;
}> = ({ contentType, onClose, projectUuid, onPick }) => {
    const opened = contentType !== null;
    const copy = PICKER_COPY[contentType ?? ContentType.DASHBOARD];
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const { data, isFetching } = useInfiniteContent(
        {
            projectUuids: [projectUuid],
            contentTypes: [contentType ?? ContentType.DASHBOARD],
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
            title={copy.title}
            size="lg"
        >
            <Stack gap="sm">
                <TextInput
                    placeholder={copy.placeholder}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    rightSection={isFetching ? <Loader size="xs" /> : null}
                />
                <Stack gap={4} mah={320} className={classes.pickerScrollList}>
                    {results.map((content) => (
                        <Group
                            key={content.uuid}
                            gap="sm"
                            wrap="nowrap"
                            p="xs"
                            className={classes.pickerRow}
                            onClick={() => onPick(content.uuid, content.name)}
                        >
                            <MantineIcon icon={copy.icon} color="dimmed" />
                            <Text size="sm" fw={500} flex={1} truncate>
                                {content.name}
                            </Text>
                            <MantineIcon icon={IconPlus} color="dimmed" />
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
    personalPlaceholders = false,
}) => {
    if (block.type !== 'quick-actions') return null;
    // The wrapper keeps the chips Group off the column layout's `.col > *`
    // flex-direction override, so the chips stay on one wrapping row.
    return (
        <Box className={classes.quickActionsBand}>
            <QuickActionCards
                actions={block.config.actions}
                projectUuid={projectUuid}
                personalPlaceholders={personalPlaceholders}
            />
        </Box>
    );
};

export const QuickActionsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const { canAskAi } = useHomepageAiState(projectUuid);
    const [pickerContentType, setPickerContentType] =
        useState<PickableContentType | null>(null);
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
        (type) =>
            !block.config.actions.some((action) => action.type === type) &&
            (type !== 'ask-ai' || canAskAi),
    );

    return (
        <Stack gap="xs">
            <Group gap={8} justify="center" className={classes.editableChipRow}>
                {block.config.actions.map((action, index) => {
                    const presentation = actionPresentation(
                        action,
                        projectUuid,
                    );
                    // Matches the view: no agent, no Ask AI row
                    if (action.type === 'ask-ai' && !canAskAi) return null;
                    return (
                        <Box
                            key={actionKey(action)}
                            className={classes.editableChip}
                        >
                            <span
                                className={`${classes.quickActionChip}${
                                    action.primary
                                        ? ` ${classes.quickActionChipPrimary}`
                                        : ''
                                }`}
                            >
                                <MantineIcon
                                    icon={presentation.icon}
                                    size={14}
                                    color={
                                        action.primary ? 'inherit' : 'ldGray.6'
                                    }
                                />
                                {presentation.title}
                            </span>
                            <Paper
                                p={4}
                                shadow="sm"
                                className={classes.editableChipActions}
                            >
                                <Group gap={2} wrap="nowrap">
                                    <Tooltip
                                        label={
                                            action.primary
                                                ? 'Primary action'
                                                : 'Make primary'
                                        }
                                    >
                                        <ActionIcon
                                            color={
                                                action.primary
                                                    ? 'yellow'
                                                    : 'ldGray.6'
                                            }
                                            size="sm"
                                            aria-label={`Make ${presentation.title} the primary action`}
                                            aria-pressed={
                                                action.primary === true
                                            }
                                            onClick={() =>
                                                // Only one primary per row
                                                setActions(
                                                    block.config.actions.map(
                                                        (item, i) => ({
                                                            ...item,
                                                            primary:
                                                                i === index
                                                                    ? !action.primary
                                                                    : false,
                                                        }),
                                                    ),
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                icon={
                                                    action.primary
                                                        ? IconStarFilled
                                                        : IconStar
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                    <ActionIcon
                                        size="sm"
                                        disabled={index === 0}
                                        aria-label={`Move ${presentation.title} earlier`}
                                        onClick={() => move(index, -1)}
                                    >
                                        <MantineIcon icon={IconArrowLeft} />
                                    </ActionIcon>
                                    <ActionIcon
                                        size="sm"
                                        disabled={
                                            index ===
                                            block.config.actions.length - 1
                                        }
                                        aria-label={`Move ${presentation.title} later`}
                                        onClick={() => move(index, 1)}
                                    >
                                        <MantineIcon icon={IconArrowRight} />
                                    </ActionIcon>
                                    <ActionIcon
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
                            </Paper>
                        </Box>
                    );
                })}
            </Group>
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
                                rightSection={
                                    STATIC_ACTION_HINTS[type] ? (
                                        <Tooltip
                                            label={STATIC_ACTION_HINTS[type]}
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                                color="dimmed"
                                            />
                                        </Tooltip>
                                    ) : undefined
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
                            onClick={() =>
                                setPickerContentType(ContentType.DASHBOARD)
                            }
                        >
                            A specific dashboard…
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFolder} />}
                            onClick={() =>
                                setPickerContentType(ContentType.SPACE)
                            }
                        >
                            A specific space…
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
            <ContentPickerModal
                contentType={pickerContentType}
                onClose={() => setPickerContentType(null)}
                projectUuid={projectUuid}
                onPick={(uuid, label) => {
                    const picked: HomepageQuickAction =
                        pickerContentType === ContentType.SPACE
                            ? { type: 'space', spaceUuid: uuid, label }
                            : { type: 'dashboard', dashboardUuid: uuid, label };
                    const alreadyAdded = block.config.actions.some(
                        (action) => actionKey(action) === actionKey(picked),
                    );
                    if (!alreadyAdded) {
                        setActions([...block.config.actions, picked]);
                    }
                    setPickerContentType(null);
                }}
            />
        </Stack>
    );
};
