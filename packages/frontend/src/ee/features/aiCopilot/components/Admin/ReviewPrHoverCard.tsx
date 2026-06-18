import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { Anchor, Button, Group, Stack, Text } from '@mantine-8/core';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentReviewItemPrDiff,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { parsePrNumber } from './reviewLane';

// ts-unused-exports:disable-next-line
export const ReviewPrHoverCard: FC<{ item: AiAgentReviewItemSummary }> = ({
    item,
}) => {
    const prNumber = parsePrNumber(item.linkedPrUrl);
    const { data: diff } = useAiAgentReviewItemPrDiff(item.fingerprint, {
        enabled: !!item.linkedPrUrl,
    });
    const updateStatus = useUpdateAiAgentReviewItemStatus();
    const isDone =
        item.status === 'resolved' ||
        item.status === 'dismissed' ||
        item.status === 'duplicate';

    return (
        <Stack gap="xs" w={280}>
            <Text fz="xs" c="dimmed" fw={600}>
                Verification
            </Text>
            <Text fz="sm" fw={600} lineClamp={2}>
                {item.title}
            </Text>
            {item.linkedPrUrl && (
                <Anchor
                    href={item.linkedPrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    fz="sm"
                >
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon icon={IconGitPullRequest} />
                        Pull request #{prNumber}
                    </Group>
                </Anchor>
            )}
            {diff && (
                <Group gap={8}>
                    <Text fz="sm" c="green.7" fw={700}>
                        +{diff.totalAdditions}
                    </Text>
                    <Text fz="sm" c="red.7" fw={700}>
                        −{diff.totalDeletions}
                    </Text>
                </Group>
            )}
            {!isDone && (
                <Button
                    size="compact-xs"
                    color="dark"
                    onClick={(e) => {
                        e.stopPropagation();
                        updateStatus.mutate({
                            fingerprint: item.fingerprint,
                            body: {
                                status: 'resolved',
                                dismissedReason: null,
                            },
                        });
                    }}
                    loading={updateStatus.isLoading}
                >
                    Mark as done
                </Button>
            )}
        </Stack>
    );
};
