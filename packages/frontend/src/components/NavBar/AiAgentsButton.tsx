import { Anchor, Button, HoverCard, Stack, Text } from '@mantine-8/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { ReviewFindingsPreview } from '../../ee/features/aiCopilot/components/ReviewFindingsPreview';
import {
    useAiAgentAdminProjectPromptActivity,
    useAiAgentAdminReviewItems,
} from '../../ee/features/aiCopilot/hooks/useAiAgentAdmin';
import { useAiAgentOrgPermission } from '../../ee/features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import MantineIcon from '../common/MantineIcon';

const PREVIEW_LIMIT = 3;
const PROMPT_TREND_DAYS = 30;

type Props = {
    projectUuid: string;
};

export const AiAgentsButton = ({ projectUuid }: Props) => {
    const navigate = useNavigate();
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const isVisible = useAiAgentButtonVisibility();
    const canViewReviews = useAiAgentOrgPermission({ action: 'manage' });
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const reviewsEnabled =
        aiOrganizationSettingsQuery.data?.aiAgentReviewsEnabled === true;
    const showReviews = !!canViewReviews && reviewsEnabled;
    const { data: reviewItems } = useAiAgentAdminReviewItems(
        { statuses: ['triage', 'open', 'in_progress'] },
        { enabled: showReviews },
    );

    const projectReviewItems = useMemo(
        () =>
            (reviewItems ?? [])
                .filter(
                    (item) =>
                        item.projectUuid === projectUuid ||
                        item.latestFinding?.projectUuid === projectUuid,
                )
                .sort(
                    (a, b) =>
                        new Date(b.lastSeenAt).getTime() -
                        new Date(a.lastSeenAt).getTime(),
                ),
        [projectUuid, reviewItems],
    );

    const reviewCount = projectReviewItems.length;
    const promptActivityQuery = useAiAgentAdminProjectPromptActivity(
        projectUuid,
        PROMPT_TREND_DAYS,
        { enabled: showReviews && reviewCount > 0 && isPreviewOpen },
    );
    const goToAskAi = () => navigate(`/projects/${projectUuid}/ai-agents`);

    if (!isVisible) {
        return null;
    }

    const reviewsUrl = `/generalSettings/ai/issues?projects=${encodeURIComponent(
        projectUuid,
    )}`;

    // No review access — plain Ask AI button, board not reachable from here.
    if (!showReviews) {
        return (
            <Button
                size="xs"
                variant="default"
                fz="sm"
                leftSection={<AiAgentIcon size={14} />}
                onClick={goToAskAi}
            >
                <Text span truncate="end" maw={150} size="sm">
                    Ask AI
                </Text>
            </Button>
        );
    }

    // Reviews enabled but nothing open yet — keep the board reachable (users can
    // file issues manually), without the findings preview / trend chart.
    if (reviewCount === 0) {
        return (
            <HoverCard
                width={240}
                shadow="lg"
                position="bottom-start"
                offset={6}
                openDelay={120}
                closeDelay={80}
                withinPortal
                portalProps={{ target: '#navbar-header' }}
            >
                <HoverCard.Target>
                    <Button
                        size="xs"
                        variant="default"
                        fz="sm"
                        leftSection={<AiAgentIcon size={14} />}
                        onClick={goToAskAi}
                    >
                        <Text span truncate="end" maw={150} size="sm">
                            Ask AI
                        </Text>
                    </Button>
                </HoverCard.Target>
                <HoverCard.Dropdown p="sm">
                    <Stack gap={6}>
                        <Text fz="xs" c="dimmed">
                            No open issues yet. Track a data gap, correction, or
                            request from a chart, dashboard, or the board.
                        </Text>
                        <Anchor
                            component={Link}
                            to={reviewsUrl}
                            fz="xs"
                            fw={500}
                        >
                            <Text span fz="xs" fw={500}>
                                Go to the issues board
                            </Text>{' '}
                            <MantineIcon
                                icon={IconArrowRight}
                                size={12}
                                display="inline"
                            />
                        </Anchor>
                    </Stack>
                </HoverCard.Dropdown>
            </HoverCard>
        );
    }

    return (
        <HoverCard
            width={290}
            shadow="lg"
            position="bottom-start"
            offset={6}
            openDelay={120}
            closeDelay={80}
            withinPortal
            portalProps={{ target: '#navbar-header' }}
            onOpen={() => setIsPreviewOpen(true)}
            onClose={() => setIsPreviewOpen(false)}
        >
            <HoverCard.Target>
                <Button
                    size="xs"
                    variant="default"
                    fz="sm"
                    leftSection={<AiAgentIcon size={15} animated calm />}
                    onClick={goToAskAi}
                >
                    <Text span truncate="end" maw={150} size="sm">
                        Ask AI
                    </Text>
                </Button>
            </HoverCard.Target>
            <HoverCard.Dropdown p="xs">
                <ReviewFindingsPreview
                    items={projectReviewItems.slice(0, PREVIEW_LIMIT)}
                    totalOpen={reviewCount}
                    reviewsUrl={reviewsUrl}
                    promptTrend={promptActivityQuery.data ?? []}
                    promptTrendDays={PROMPT_TREND_DAYS}
                    isLoadingPromptTrend={promptActivityQuery.isFetching}
                />
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
