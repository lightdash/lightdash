import { type AiAgentSummary } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Menu,
    Paper,
    Skeleton,
    Textarea,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconArrowRight,
    IconChevronDown,
    IconCube,
    IconMessageCircle,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import Logo from '../../../../svgs/grey-icon-logo.svg?react';
import { useCreateAgentCodingSession } from '../../../hooks/useAgentCodingSessions';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../../features/aiCopilot/hooks/useUserAgentPreferences';
import { store } from '../../../features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../../features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';
import styles from './aiSearchBox.module.css';

const PLACEHOLDER_PHRASES = [
    'Build a dashboard to measure...',
    'Create a chart to show...',
    'Make all my dashboards beautiful...',
    'Add a new metric for...',
];

const useTypewriterPlaceholder = (phrases: string[], typingSpeed = 50) => {
    const [placeholder, setPlaceholder] = useState('');
    const [phraseIndex, setPhraseIndex] = useState(0);

    useEffect(() => {
        const currentPhrase = phrases[phraseIndex];
        let charIndex = 0;
        let timeoutId: ReturnType<typeof setTimeout>;

        const typeNextChar = () => {
            if (charIndex <= currentPhrase.length) {
                setPlaceholder(currentPhrase.slice(0, charIndex));
                charIndex++;
                timeoutId = setTimeout(typeNextChar, typingSpeed);
            } else {
                // Wait before moving to next phrase
                timeoutId = setTimeout(() => {
                    setPhraseIndex((prev) => (prev + 1) % phrases.length);
                }, 2000);
            }
        };

        typeNextChar();

        return () => clearTimeout(timeoutId);
    }, [phraseIndex, phrases, typingSpeed]);

    return placeholder;
};

type Mode = 'build' | 'ask';

type Props = {
    projectUuid: string;
};

const AiSearchBoxInner: FC<Props> = ({ projectUuid }) => {
    const navigate = useNavigate();
    const [mode, setMode] = useState<Mode>('build');
    const typewriterPlaceholder = useTypewriterPlaceholder(PLACEHOLDER_PHRASES);

    const { data: agents, isLoading: isLoadingAgents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const {
        data: userAgentPreferences,
        isLoading: isLoadingUserAgentPreferences,
    } = useGetUserAgentPreferences(projectUuid);
    const [selectedAgent, setSelectedAgent] = useState<AiAgentSummary>();

    useEffect(() => {
        if (!agents || agents.length === 0) return;

        const preferredAgent =
            agents.find(
                (agent) =>
                    agent.uuid === userAgentPreferences?.defaultAgentUuid,
            ) ?? agents[0];
        setSelectedAgent(preferredAgent);
    }, [agents, userAgentPreferences?.defaultAgentUuid]);

    const form = useForm({
        initialValues: {
            prompt: '',
        },
    });

    const { mutateAsync: createAgentThread } = useCreateAgentThreadMutation(
        selectedAgent?.uuid,
        projectUuid,
    );

    const createCodingSession = useCreateAgentCodingSession(projectUuid);

    const handleSubmit = useCallback(async () => {
        const prompt = form.values.prompt.trim();
        if (!prompt) return;

        if (mode === 'build') {
            const branchName = `lightdash/ai/${Date.now()}`;
            const session = await createCodingSession.mutateAsync({
                prompt,
                githubBranch: branchName,
            });
            void navigate(
                `/projects/${projectUuid}/agent-coding-sessions?session=${session.sessionUuid}`,
            );
        } else {
            if (!selectedAgent) {
                void navigate(`/projects/${projectUuid}/ai-agents`);
            } else {
                await createAgentThread({ prompt });
            }
        }
    }, [
        form.values.prompt,
        mode,
        createCodingSession,
        navigate,
        projectUuid,
        selectedAgent,
        createAgentThread,
    ]);

    const onFormSubmit = form.onSubmit(() => {
        void handleSubmit();
    });

    if (isLoadingAgents || isLoadingUserAgentPreferences) {
        return (
            <Paper style={{ overflow: 'hidden' }} p="md">
                <Group wrap="nowrap" align="center">
                    <Skeleton circle height={38} width={38} />
                    <Skeleton height={36} flex={1} />
                    <Skeleton circle height={28} width={28} />
                </Group>
            </Paper>
        );
    }

    if (!agents) {
        return null;
    }

    const isLoading = createCodingSession.isLoading;

    return (
        <Paper
            classNames={{
                root: styles.paperRoot,
            }}
        >
            <form onSubmit={onFormSubmit}>
                {/* Textarea area */}
                <Box p="md" pb="sm">
                    <Textarea
                        rows={4}
                        placeholder={typewriterPlaceholder}
                        {...form.getInputProps('prompt')}
                        classNames={{
                            input: styles.textareaInput,
                        }}
                    />
                </Box>

                {/* Footer bar */}
                <Box px="md" pb="md">
                    <Group justify="space-between">
                        <Menu position="bottom-start" withinPortal>
                            <Menu.Target>
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    leftSection={
                                        <MantineIcon
                                            icon={
                                                mode === 'build'
                                                    ? IconCube
                                                    : IconMessageCircle
                                            }
                                        />
                                    }
                                    rightSection={
                                        <MantineIcon icon={IconChevronDown} />
                                    }
                                    classNames={{
                                        root: styles.modeButton,
                                    }}
                                >
                                    {mode === 'build' ? 'Build' : 'Ask'}
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    leftSection={<MantineIcon icon={IconCube} />}
                                    onClick={() => setMode('build')}
                                >
                                    Build
                                </Menu.Item>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconMessageCircle} />
                                    }
                                    onClick={() => setMode('ask')}
                                >
                                    Ask
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>

                        <Button
                            type="submit"
                            variant="subtle"
                            color="gray"
                            disabled={!form.values.prompt.trim()}
                            loading={isLoading}
                            leftSection={
                                <Box className={styles.startIconWrapper}>
                                    <Logo className={styles.logoIcon} />
                                </Box>
                            }
                            rightSection={
                                <MantineIcon icon={IconArrowRight} />
                            }
                        >
                            Start
                        </Button>
                    </Group>
                </Box>
            </form>
        </Paper>
    );
};

const AiSearchBox: FC<Props> = (props) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <AiSearchBoxInner {...props} />
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);

export default AiSearchBox;
