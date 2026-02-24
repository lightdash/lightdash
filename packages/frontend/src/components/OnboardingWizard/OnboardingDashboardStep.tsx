import type { AgentCodingSession, ApiError } from '@lightdash/common';
import {
    Box,
    Button,
    Stack,
    Text,
    Textarea,
    Title,
} from '@mantine-8/core';
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import {
    AgentCodingChatDisplay,
    useAgentCodingStream,
} from '../../ee/features/agentCodingSessions';
import {
    useAgentCodingSessionMessages,
    useCreateAgentCodingSession,
} from '../../ee/hooks/useAgentCodingSessions';
import MantineIcon from '../common/MantineIcon';
import classes from './OnboardingDashboardStep.module.css';

const NEW_REPO_PROMPT_TEMPLATE = `Create a blank Lightdash YML-only project. Use the \`lightdash sql\` command to explore the warehouse to find relevant tables for the user's question. Add models with metrics, charts, and dashboards to best answer the user's query. Your goal is to showcase the capabilities of Lightdash. Deploy it afterwards.

User's question: `;

const EXISTING_REPO_PROMPT_TEMPLATE = `Explore the existing repository to see if it is a dbt project or a Lightdash YML project. Then check if there are existing models/metrics to answer the user's question. If there aren't, use \`lightdash sql\` to explore the warehouse to create some in dbt/Lightdash YML depending on the project type. Then check if there are existing charts and dashboards as code. If there isn't a relevant dashboard, create one. Then deploy it.

User's question: `;

const SUGGESTED_QUESTIONS = [
    'What are my top customers by revenue?',
    'Show me sales trends over the past year',
    'Create a dashboard showing key business metrics',
];

type Props = {
    projectUuid: string;
    selectedRepo: { owner: string; repo: string; branch: string };
    isNewRepo: boolean;
};


export const OnboardingDashboardStep: FC<Props> = ({
    projectUuid,
    selectedRepo: _selectedRepo,
    isNewRepo,
}) => {
    const navigate = useNavigate();
    const [userQuestion, setUserQuestion] = useState('');
    const [session, setSession] = useState<AgentCodingSession | null>(null);

    const createSessionMutation = useCreateAgentCodingSession(projectUuid);

    const { data: messages = [], refetch: refetchMessages } =
        useAgentCodingSessionMessages(
            projectUuid,
            session?.sessionUuid,
        );

    // Determine if streaming should be enabled
    const shouldStream =
        session !== null &&
        (session.status === 'pending' || session.status === 'running');

    const handleStreamEnd = useCallback(() => {
        void refetchMessages();
        // Update session status when stream completes
        setSession((prev) => (prev ? { ...prev, status: 'finished' } : null));
    }, [refetchMessages]);

    const { streamSegments, isStreaming, error } = useAgentCodingStream({
        projectUuid,
        sessionUuid: session?.sessionUuid ?? '',
        enabled: shouldStream,
        onComplete: handleStreamEnd,
    });

    const handleStartSession = useCallback(() => {
        if (!userQuestion.trim()) return;

        const promptTemplate = isNewRepo
            ? NEW_REPO_PROMPT_TEMPLATE
            : EXISTING_REPO_PROMPT_TEMPLATE;
        const fullPrompt = promptTemplate + userQuestion.trim();

        const branchName = `lightdash/ai/onboarding-${Date.now()}`;

        createSessionMutation.mutate(
            {
                prompt: fullPrompt,
                githubBranch: branchName,
            },
            {
                onSuccess: (createdSession) => {
                    setSession(createdSession);
                },
            },
        );
    }, [userQuestion, isNewRepo, createSessionMutation]);

    const handleSelectSuggestion = (question: string) => {
        setUserQuestion(question);
    };

    const handleContinueToProject = () => {
        void navigate(`/projects/${projectUuid}/home`);
    };

    // Show the session chat view
    if (session) {
        const isSessionActive =
            session.status === 'pending' || session.status === 'running';
        const isSessionComplete =
            session.status === 'finished' || session.status === 'errored';

        return (
            <Stack h={500} gap={0}>
                {error && (
                    <Box pb="md">
                        <Text size="sm" c="red">
                            Error: {error}
                        </Text>
                    </Box>
                )}

                {/* Chat display */}
                <Box flex={1} className={classes.chatContainer}>
                    <AgentCodingChatDisplay
                        messages={messages}
                        streamSegments={streamSegments}
                        isStreaming={isStreaming}
                    />
                </Box>

                {/* Footer */}
                {isSessionComplete && (
                    <Box pt="md">
                        <Button
                            size="lg"
                            fullWidth
                            rightSection={<MantineIcon icon={IconArrowRight} />}
                            onClick={handleContinueToProject}
                        >
                            Continue to your project
                        </Button>
                    </Box>
                )}
                {isSessionActive && (
                    <Box pt="md">
                        <Text
                            size="sm"
                            ta="center"
                            fw={500}
                            className={classes.shimmerText}
                        >
                            Lightdash is generating your project...
                        </Text>
                    </Box>
                )}
            </Stack>
        );
    }

    // Show the question input form
    return (
        <Stack gap="md">
            <Box>
                <Title order={4}>Create your first dashboard</Title>
                <Text c="dimmed" size="sm">
                    Tell us what you want to analyze and our AI will create
                    models, metrics, and a dashboard for you.
                </Text>
            </Box>

            <Box>
                <Text size="sm" fw={500} mb="xs">
                    What would you like to see?
                </Text>
                <Textarea
                    placeholder="e.g., Show me my top customers by revenue"
                    minRows={3}
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                />
            </Box>

            <Box>
                <Text size="xs" c="dimmed" mb="xs">
                    Or try one of these:
                </Text>
                <Box className={classes.suggestionsRow}>
                    {SUGGESTED_QUESTIONS.map((question) => (
                        <Button
                            key={question}
                            size="xs"
                            variant="light"
                            onClick={() => handleSelectSuggestion(question)}
                        >
                            {question}
                        </Button>
                    ))}
                </Box>
            </Box>

            <Button
                size="lg"
                leftSection={<MantineIcon icon={IconSparkles} />}
                onClick={handleStartSession}
                loading={createSessionMutation.isLoading}
                disabled={!userQuestion.trim()}
            >
                Create Dashboard with AI
            </Button>

            {createSessionMutation.isError && (
                <Text c="red" size="sm">
                    Error:{' '}
                    {(createSessionMutation.error as ApiError)?.error?.message}
                </Text>
            )}

            <Button variant="subtle" onClick={handleContinueToProject}>
                Skip for now
            </Button>
        </Stack>
    );
};
