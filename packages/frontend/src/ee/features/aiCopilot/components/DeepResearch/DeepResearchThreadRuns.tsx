import { Alert, Button, Paper, Skeleton, Stack, Text } from '@mantine-8/core';
import { type DeepResearchRunRegistration } from '../../deepResearch/types';
import {
    useContinueDeepResearchMutation,
    useDeepResearchRun,
} from '../../hooks/useDeepResearch';
import {
    DeepResearchRunCard,
    DeepResearchRunHeading,
} from './DeepResearchRunCard';
import styles from './DeepResearchRunCard.module.css';

const DeepResearchThreadRun = ({
    registration,
    canRetry,
    onRunAgain,
}: {
    registration: DeepResearchRunRegistration;
    canRetry: boolean;
    onRunAgain?: (registration: DeepResearchRunRegistration) => void;
}) => {
    const runQuery = useDeepResearchRun(registration);
    const continueMutation = useContinueDeepResearchMutation({
        projectUuid: registration.projectUuid,
        agentUuid: registration.agentUuid,
        threadUuid: registration.threadUuid,
    });

    if (registration.state !== 'started') {
        const failed = registration.state === 'start_failed';
        return (
            <Paper
                className={styles.card}
                p="lg"
                radius="md"
                aria-label="Deep research run"
            >
                <Stack gap="md">
                    <DeepResearchRunHeading
                        statusLabel={failed ? 'Could not start' : 'Queued'}
                    />
                    {failed ? (
                        <Alert color="red">
                            {registration.errorMessage ??
                                'Research didn’t start. Your question is saved in this thread.'}
                        </Alert>
                    ) : (
                        <Text size="sm" c="dimmed" aria-live="polite">
                            Starting research… You can leave this page while it
                            runs.
                        </Text>
                    )}
                    {failed && (
                        <Button
                            size="xs"
                            w="fit-content"
                            loading={continueMutation.isLoading}
                            disabled={!canRetry}
                            onClick={() => {
                                if (!canRetry) {
                                    return;
                                }
                                continueMutation.mutate({
                                    question: registration.question,
                                    promptUuid: registration.promptUuid,
                                });
                            }}
                        >
                            Try starting again
                        </Button>
                    )}
                </Stack>
            </Paper>
        );
    }
    if (runQuery.isLoading) {
        return <Skeleton h={160} radius="md" />;
    }
    if (runQuery.isError && !runQuery.data) {
        return (
            <Paper
                className={styles.card}
                p="lg"
                radius="md"
                aria-label="Deep research run"
            >
                <Stack gap="sm">
                    <DeepResearchRunHeading statusLabel="Updates unavailable" />
                    <Alert
                        color="yellow"
                        title="Couldn’t load the latest activity"
                    >
                        Your research is still saved. Check your connection,
                        then refresh the activity.
                    </Alert>
                    <Button
                        size="xs"
                        variant="default"
                        w="fit-content"
                        onClick={() => {
                            void runQuery.refetch();
                            void runQuery.eventsQuery.refetch();
                        }}
                    >
                        Refresh activity
                    </Button>
                </Stack>
            </Paper>
        );
    }
    if (!runQuery.data) {
        return null;
    }
    return (
        <DeepResearchRunCard
            run={runQuery.data}
            projectUuid={registration.projectUuid}
            canRunAgain={canRetry}
            onRunAgain={onRunAgain ? () => onRunAgain(registration) : undefined}
        />
    );
};

export const DeepResearchThreadRuns = ({
    registrations,
    canRetry = false,
    onRunAgain,
}: {
    registrations: DeepResearchRunRegistration[];
    canRetry?: boolean;
    onRunAgain?: (registration: DeepResearchRunRegistration) => void;
}) => {
    if (!registrations.length) {
        return null;
    }
    return (
        <Stack gap="md">
            {registrations.map((registration) => (
                <DeepResearchThreadRun
                    key={registration.runUuid}
                    registration={registration}
                    canRetry={canRetry}
                    onRunAgain={onRunAgain}
                />
            ))}
        </Stack>
    );
};
