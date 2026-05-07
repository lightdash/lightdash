import { type AiAgentSummary } from '@lightdash/common';
import { ActionIcon, Group, Menu, Text, UnstyledButton } from '@mantine-8/core';
import {
    IconCheck,
    IconChevronDown,
    IconWindowMaximize,
    IconMinus,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { closePanel, openPanel } from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './AiAgentsLauncher.module.css';
import { launcherSession } from './launcherSession';

type Props = {
    projectUuid: string;
    agent: AiAgentSummary | null;
    agents: AiAgentSummary[];
    title: string;
    threadId: string | null;
};

export const PanelHeader: FC<Props> = ({
    projectUuid,
    agent,
    agents,
    title,
    threadId,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const navigate = useNavigate();
    const pendingContext = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.pendingContext,
    );

    const canSwitchAgent = threadId === null && agents.length > 1;

    const handleClose = () => dispatch(closePanel());
    const handleSwitchAgent = (nextAgentUuid: string) => {
        dispatch(
            openPanel({
                threadId: null,
                agentUuid: nextAgentUuid,
                pendingContext,
            }),
        );
    };
    const handleExpand = () => {
        if (!agent) return;
        launcherSession.markExpandedFromBubble();
        let target;
        if (threadId) {
            target = `/projects/${projectUuid}/ai-agents/${agent.uuid}/threads/${threadId}`;
        } else {
            const params = new URLSearchParams();
            if (pendingContext?.chartUuid) {
                params.set('chartUuid', pendingContext.chartUuid);
            }
            if (pendingContext?.dashboardUuid) {
                params.set('dashboardUuid', pendingContext.dashboardUuid);
            }
            const search = params.toString();
            target = `/projects/${projectUuid}/ai-agents/${agent.uuid}/threads${
                search ? `?${search}` : ''
            }`;
        }
        dispatch(closePanel());
        void navigate(target);
    };

    return (
        <div className={styles.panelHeader}>
            <Group gap="xs" wrap="nowrap" className={styles.flexFillNoMin}>
                {canSwitchAgent ? (
                    <Menu position="bottom-start" withinPortal={false}>
                        <Menu.Target>
                            <UnstyledButton aria-label="Switch agent">
                                <Group gap="xs" wrap="nowrap">
                                    <LightdashUserAvatar
                                        size="sm"
                                        name={agent?.name ?? 'AI'}
                                        src={agent?.imageUrl}
                                    />
                                    <Text
                                        size="sm"
                                        fw={500}
                                        className={styles.panelHeaderTitle}
                                    >
                                        {title}
                                    </Text>
                                    <MantineIcon
                                        icon={IconChevronDown}
                                        color="ldGray.6"
                                        size={14}
                                    />
                                </Group>
                            </UnstyledButton>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {agents.map((a) => (
                                <Menu.Item
                                    key={a.uuid}
                                    leftSection={
                                        <LightdashUserAvatar
                                            size="xs"
                                            name={a.name}
                                            src={a.imageUrl}
                                        />
                                    }
                                    rightSection={
                                        a.uuid === agent?.uuid ? (
                                            <MantineIcon icon={IconCheck} />
                                        ) : null
                                    }
                                    onClick={() => handleSwitchAgent(a.uuid)}
                                >
                                    {a.name}
                                </Menu.Item>
                            ))}
                        </Menu.Dropdown>
                    </Menu>
                ) : (
                    <Group gap="xs" wrap="nowrap" className={styles.minWidth0}>
                        <LightdashUserAvatar
                            size="sm"
                            name={agent?.name ?? 'AI'}
                            src={agent?.imageUrl}
                        />
                        <Text
                            size="sm"
                            fw={500}
                            className={styles.panelHeaderTitle}
                        >
                            {title}
                        </Text>
                    </Group>
                )}
            </Group>
            <Group gap="xs" wrap="nowrap">
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={handleExpand}
                    disabled={!agent}
                    aria-label="Open in fullscreen"
                >
                    <MantineIcon
                        icon={IconWindowMaximize}
                        size={16}
                        style={{ transform: 'scaleX(-1)' }}
                    />
                </ActionIcon>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={handleClose}
                    aria-label="Close panel"
                >
                    <MantineIcon icon={IconMinus} size={16} />
                </ActionIcon>
            </Group>
        </div>
    );
};
