import { Alert, Button, Paper, Skeleton, Stack, Text } from '@mantine-8/core';
import { useMemo } from 'react';
import useUser from '../../../../../hooks/user/useUser';
import { useDeepResearchRunsForThread } from '../../deepResearch/deepResearchRegistry';
import { toDeepResearchRegistration } from '../../deepResearch/runProgress';
import { type DeepResearchRunRegistration } from '../../deepResearch/types';
import {
    useContinueDeepResearchMutation,
    useDeepResearchRun,
    useDeepResearchThreadRuns,
} from '../../hooks/useDeepResearch';
import { DeepResearchRunCard } from './DeepResearchRunCard';

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
    const userUuid = user.data?.userUuid;
    // Server is the source of truth; the local registry only contributes
    // optimistic entries (starting / start_failed / just-started runs the
    // list has not caught up with yet).
    const serverRuns = useDeepResearchThreadRuns(projectUuid, threadUuid);
    const localRegistrations = useDeepResearchRunsForThread(
        projectUuid,
        threadUuid,
        userUuid,
    );
    const registrations = useMemo(() => {
        const fromServer = (serverRuns.data ?? []).map((run) =>
            toDeepResearchRegistration(run, {
                threadUuid,
                userUuid: userUuid ?? '',
            }),
        );
        const serverRunUuids = new Set(
            fromServer.map((registration) => registration.runUuid),
        );
        return [
            ...fromServer,
            ...localRegistrations.filter(
                (registration) => !serverRunUuids.has(registration.runUuid),
            ),
        ];
    }, [serverRuns.data, localRegistrations, threadUuid, userUuid]);

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
