import { Button, Stack, Text } from '@mantine-8/core';
import { IconCircleCheck, IconGitMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useUpdateAiAgentReviewItemStatus } from '../../hooks/useAiAgentAdmin';
import { useMergePullRequest } from '../../hooks/useMergePullRequest';

type Props = {
    opened: boolean;
    onClose: () => void;
    fingerprint: string;
    /** Project that owns the PR (the remediation's source project). */
    projectUuid: string;
    prUrl: string | null;
};

/**
 * Resolves an issue from the workspace: optionally merge the open PR, then
 * mark the item resolved (which also closes its remediation server-side).
 */
export const MarkResolvedModal: FC<Props> = ({
    opened,
    onClose,
    fingerprint,
    projectUuid,
    prUrl,
}) => {
    const merge = useMergePullRequest(projectUuid);
    const updateStatus = useUpdateAiAgentReviewItemStatus();

    const markResolved = () =>
        updateStatus.mutate(
            {
                fingerprint,
                body: { status: 'resolved', dismissedReason: null },
            },
            { onSuccess: () => onClose() },
        );

    const mergeAndResolve = () => {
        if (!prUrl) return;
        merge.mutate({ prUrl, sha: null }, { onSuccess: markResolved });
    };

    const isMerging = merge.isLoading;
    const isResolving = updateStatus.isLoading;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Resolve issue"
            icon={IconCircleCheck}
            size="md"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Resolving marks this issue as done and closes its
                    remediation.
                    {prUrl
                        ? ' Merge the pull request first, or resolve without merging.'
                        : ''}
                </Text>
                <Stack gap="xs">
                    {prUrl && (
                        <Button
                            color="green"
                            leftSection={<MantineIcon icon={IconGitMerge} />}
                            loading={isMerging}
                            disabled={isResolving}
                            onClick={mergeAndResolve}
                        >
                            Merge PR & mark resolved
                        </Button>
                    )}
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconCircleCheck} />}
                        loading={isResolving}
                        disabled={isMerging}
                        onClick={markResolved}
                    >
                        {prUrl
                            ? 'Mark resolved without merging'
                            : 'Mark resolved'}
                    </Button>
                </Stack>
            </Stack>
        </MantineModal>
    );
};
