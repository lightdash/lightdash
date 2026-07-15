import { Alert, Button, Paper, Skeleton, Stack, Text } from '@mantine-8/core';
import useUser from '../../../../../hooks/user/useUser';
import {
    requestDeepResearchComposerPrompt,
    useDeepResearchRunsForThread,
} from '../../deepResearch/deepResearchRegistry';
import { type DeepResearchRunRegistration } from '../../deepResearch/types';
import {
    useContinueDeepResearchMutation,
    useDeepResearchRun,
} from '../../hooks/useDeepResearch';
import { DeepResearchRunCard } from './DeepResearchRunCard';

const NEXT_DEPTH: Record<
    DeepResearchRunRegistration['depth'],
    DeepResearchRunRegistration['depth']
> = {
    quick: 'standard',
    standard: 'deep',
    deep: 'exhaustive',
    exhaustive: 'exhaustive',
};

const DeepResearchThreadRun = ({
    registration,
}: {
    registration: DeepResearchRunRegistration;
}) => {
    const runQuery = useDeepResearchRun(registration);
    const continueMutation = useContinueDeepResearchMutation({
        projectUuid: registration.projectUuid,
        threadUuid: registration.threadUuid,
    });

    if (registration.state !== 'started') {
        const failed = registration.state === 'start_failed';
        return (
            <Paper p="lg" radius="md" withBorder aria-label="Deep research run">
                <Stack gap="xs">
                    <Text size="xs" c="indigo" fw={700} tt="uppercase">
                        Deep research
                    </Text>
                    <Text fw={600}>{registration.question}</Text>
                    {failed ? (
                        <Alert color="red" title="Research did not start">
                            {registration.errorMessage ??
                                'The run could not be created. Your question is preserved in this thread; try again when the service is available.'}
                        </Alert>
                    ) : (
                        <Text size="sm" c="dimmed" aria-live="polite">
                            Starting research… The run card is saved in this
                            thread.
                        </Text>
                    )}
                    {failed && (
                        <Button
                            size="xs"
                            w="fit-content"
                            loading={continueMutation.isLoading}
                            onClick={() =>
                                continueMutation.mutate({
                                    question: registration.question,
                                    depth: registration.depth,
                                })
                            }
                        >
                            Try again
                        </Button>
                    )}
                </Stack>
            </Paper>
        );
    }
    if (runQuery.isLoading) {
        return <Skeleton h={190} radius="md" />;
    }
    if (runQuery.isError || runQuery.eventsQuery.isError) {
        return (
            <Paper p="lg" radius="md" withBorder aria-label="Deep research run">
                <Stack gap="sm">
                    <Text size="xs" c="indigo" fw={700} tt="uppercase">
                        Deep research
                    </Text>
                    <Text fw={600}>{registration.question}</Text>
                    <Alert color="yellow" title="Could not refresh this run">
                        The durable run is still saved. Check your connection
                        and try loading its latest state again.
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
                        Try again
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
            onAskFollowUp={() =>
                requestDeepResearchComposerPrompt(
                    registration.threadUuid,
                    `Follow up on the research about “${registration.question}”: `,
                )
            }
            onChallenge={() =>
                requestDeepResearchComposerPrompt(
                    registration.threadUuid,
                    `Challenge the research findings about “${registration.question}”. Look for contradictory evidence and test the weakest assumption: `,
                )
            }
            onRerun={() =>
                continueMutation.mutate({
                    question: registration.question,
                    depth: NEXT_DEPTH[registration.depth],
                })
            }
        />
    );
};

export const DeepResearchThreadRuns = ({
    projectUuid,
    threadUuid,
}: {
    projectUuid: string;
    threadUuid: string;
}) => {
    const user = useUser(true);
    const registrations = useDeepResearchRunsForThread(
        projectUuid,
        threadUuid,
        user.data?.userUuid,
    );
    if (!registrations.length) {
        return null;
    }
    return (
        <Stack gap="md">
            {registrations.map((registration) => (
                <DeepResearchThreadRun
                    key={registration.runUuid}
                    registration={registration}
                />
            ))}
        </Stack>
    );
};
