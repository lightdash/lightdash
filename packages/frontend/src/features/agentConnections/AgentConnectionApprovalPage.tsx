import {
    FeatureFlags,
    type AgentCapability,
    type AgentConnectionApprovalDecision,
    type AgentConnectionApprovalDecisionResponse,
    type AgentConnectionApprovalErrorResponse,
    type AgentConnectionApprovalReview,
    type ApiError,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Container,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { v4 as uuid, validate as isUuid } from 'uuid';
import { lightdashApi } from '../../api';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { ApprovalActionRow } from './ApprovalActionRow';
import {
    ApprovalCompletion,
    type ApprovalCompletionState,
} from './ApprovalCompletion';
import { approvalDuration, getApprovalActions } from './approvalSelection';
import { openCompletionTab, navigateCompletionTab } from './completionDelivery';

type ApprovalError = ApiError | AgentConnectionApprovalErrorResponse;
const isTerminal = (failure: ApprovalError | null) =>
    failure?.error.statusCode === 410 ||
    (failure?.error.name === 'AgentConnectionApprovalError' &&
        (failure as AgentConnectionApprovalErrorResponse).error.code ===
            'approval_request_consumed');

const ApprovalReview = ({ requestUuid }: { requestUuid: string }) => {
    const client = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();
    // A per-mount key so a return from sign-in never reuses an old nonce.
    const [mountId] = useState(() => uuid());
    const queryKey = ['agent-connection-review', requestUuid, mountId];
    const reviewQuery = useQuery<AgentConnectionApprovalReview, ApprovalError>({
        queryKey,
        queryFn: ({ signal }) =>
            lightdashApi({
                version: 'v2',
                url: `/user/agent-connections/requests/${encodeURIComponent(requestUuid)}`,
                method: 'GET',
                sensitive: true,
                signal,
            }),
        cacheTime: 0,
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
    });
    const [excludedProjects, setExcludedProjects] = useState(
        () => new Set<string>(),
    );
    const [excludedActions, setExcludedActions] = useState(
        () => new Set<AgentCapability>(),
    );
    const [failure, setFailure] = useState<ApprovalError | null>(null);
    const [reviewMessage, setReviewMessage] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const submitting = useRef(false);
    const [completion, setCompletion] =
        useState<ApprovalCompletionState | null>(null);
    const review = reviewQuery.data;
    const selectedProjects =
        review?.projects.filter(
            (project) =>
                project.selectable &&
                !excludedProjects.has(project.projectUuid),
        ) ?? [];
    const actions = getApprovalActions(selectedProjects);
    const capabilities = actions
        .filter(
            (action) =>
                action.offered > 0 && !excludedActions.has(action.capability),
        )
        .map((action) => action.capability);
    const decide = async (
        decision: AgentConnectionApprovalDecision['decision'],
    ) => {
        if (!review || submitting.current) return;
        submitting.current = true;
        setPending(true);
        setFailure(null);
        const popup = openCompletionTab();
        try {
            const result = await lightdashApi<
                AgentConnectionApprovalDecisionResponse['results']
            >({
                version: 'v2',
                url: `/user/agent-connections/requests/${encodeURIComponent(requestUuid)}/decision`,
                method: 'POST',
                sensitive: true,
                body: JSON.stringify({
                    decision,
                    revision: review.revision,
                    nonce: review.nonce,
                    projectUuids:
                        decision === 'approve'
                            ? selectedProjects.map(
                                  (project) => project.projectUuid,
                              )
                            : [],
                    capabilities: decision === 'approve' ? capabilities : [],
                } satisfies AgentConnectionApprovalDecision),
            });
            const attempted =
                popup !== null &&
                navigateCompletionTab(popup, result.completionUrl);
            setCompletion({
                decision,
                completionUrl: result.completionUrl,
                attempted,
                projects: selectedProjects,
                notice: review.notice,
            });
        } catch (caught) {
            popup?.close();
            const apiError = caught as ApprovalError;
            const details =
                apiError.error as AgentConnectionApprovalErrorResponse['error'];
            if (apiError.error.statusCode === 401) {
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                    await Promise.race([
                        client.invalidateQueries(['health']),
                        new Promise<void>((resolve) => {
                            timer = setTimeout(resolve, 5000);
                        }),
                    ]);
                } finally {
                    clearTimeout(timer);
                    await navigate('/login', { state: { from: location } });
                }
            } else if (
                details.code === 'approval_selection_changed' ||
                details.code === 'csrf_failed'
            ) {
                setReviewMessage(
                    details.code === 'approval_selection_changed' &&
                        details.review
                        ? 'Your permissions changed. Check the selection and approve again.'
                        : 'This review is out of date. Check it again.',
                );
                if (details.review)
                    client.setQueryData(queryKey, details.review);
                else await reviewQuery.refetch();
            } else setFailure(apiError);
        } finally {
            submitting.current = false;
            setPending(false);
        }
    };
    if (completion) return <ApprovalCompletion completion={completion} />;
    const error = failure ?? reviewQuery.error;
    if (error && (isTerminal(error) || !review || reviewQuery.isError))
        return (
            <InlineErrorState
                message={error.error.message}
                onRetry={
                    isTerminal(error)
                        ? undefined
                        : () => void reviewQuery.refetch()
                }
            />
        );
    if (!review) return <EmptyStateLoader title="Loading approval" />;
    return (
        <Stack gap="lg">
            <Callout variant="info">{review.notice}</Callout>
            <Box>
                <Title order={3}>Connect your CLI agent</Title>
                <Text size="sm">{review.request.name} · CLI</Text>
            </Box>
            {reviewMessage && (
                <Callout variant="warning">{reviewMessage}</Callout>
            )}
            {failure && <InlineErrorState message={failure.error.message} />}
            <Stack gap="xs">
                <Title order={5}>Projects</Title>
                {review.projects.map((project) => (
                    <Box key={project.projectUuid}>
                        <Checkbox
                            label={project.name}
                            disabled={!project.selectable || pending}
                            checked={
                                project.selectable &&
                                !excludedProjects.has(project.projectUuid)
                            }
                            aria-describedby={
                                project.reason
                                    ? `project-${project.projectUuid}-reason`
                                    : undefined
                            }
                            onChange={() =>
                                setExcludedProjects((current) => {
                                    const next = new Set(current);
                                    if (next.has(project.projectUuid))
                                        next.delete(project.projectUuid);
                                    else next.add(project.projectUuid);
                                    return next;
                                })
                            }
                        />
                        {project.reason && (
                            <Text
                                id={`project-${project.projectUuid}-reason`}
                                size="xs"
                                c="dimmed"
                            >
                                {project.reason}
                            </Text>
                        )}
                    </Box>
                ))}
            </Stack>
            <Stack gap="xs">
                <Title order={5}>Actions</Title>
                {actions.map((action) => (
                    <ApprovalActionRow
                        key={action.capability}
                        action={action}
                        projectCount={selectedProjects.length}
                        disabled={pending}
                        checked={
                            action.offered > 0 &&
                            !excludedActions.has(action.capability)
                        }
                        onChange={() =>
                            setExcludedActions((current) => {
                                const next = new Set(current);
                                if (next.has(action.capability))
                                    next.delete(action.capability);
                                else next.add(action.capability);
                                return next;
                            })
                        }
                    />
                ))}
            </Stack>
            <Group gap="xs">
                <Text size="sm" c="dimmed">
                    Expires {approvalDuration(review.request.expiresInSeconds)}{' '}
                    after approval
                </Text>
                {review.request.expiresInSeconds > 86400 && (
                    <Text size="sm" c="orange">
                        Longer than the usual 24 hours
                    </Text>
                )}
            </Group>
            <Group justify="flex-end">
                <Button
                    variant="default"
                    disabled={pending}
                    onClick={() => void decide('deny')}
                >
                    Cancel
                </Button>
                <Button
                    loading={pending}
                    disabled={selectedProjects.length === 0 || pending}
                    onClick={() => void decide('approve')}
                >
                    Approve
                </Button>
            </Group>
        </Stack>
    );
};

const AgentConnectionApprovalPage = () => {
    const flag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const [params] = useSearchParams();
    const requestUuid = params.get('request');
    if (flag.data?.enabled !== true) return null;
    return (
        <Container size="xs" py="xl">
            <Paper p="xl">
                {requestUuid &&
                isUuid(requestUuid) &&
                params.getAll('request').length === 1 ? (
                    <ApprovalReview
                        key={requestUuid}
                        requestUuid={requestUuid}
                    />
                ) : (
                    <InlineErrorState message="This approval link is missing a valid request." />
                )}
            </Paper>
        </Container>
    );
};
export default AgentConnectionApprovalPage;
