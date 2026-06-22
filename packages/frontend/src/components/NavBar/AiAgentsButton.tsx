import { Button, HoverCard, Text } from '@mantine-8/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { ReviewFindingsPreview } from '../../ee/features/aiCopilot/components/ReviewFindingsPreview';
import {
    useAiAgentAdminProjectPromptActivity,
    useAiAgentAdminReviewItems,
} from '../../ee/features/aiCopilot/hooks/useAiAgentAdmin';
import { useAiAgentPermission } from '../../ee/features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';

const PREVIEW_LIMIT = 3;
const PROMPT_TREND_DAYS = 14;

type Props = {
    projectUuid: string;
};

export const AiAgentsButton = ({ projectUuid }: Props) => {
    const navigate = useNavigate();
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const isVisible = useAiAgentButtonVisibility();
    const canViewReviews = useAiAgentPermission({ action: 'manage' });
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const reviewsEnabled =
        aiOrganizationSettingsQuery.data?.aiAgentReviewsEnabled === true;
    const showReviews = !!canViewReviews && reviewsEnabled;
    const { data: reviewItems } = useAiAgentAdminReviewItems(
        { statuses: ['open'] },
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

    // Original button — nothing to surface (no review access, or no open findings).
    if (!showReviews || reviewCount === 0) {
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

    const reviewsUrl = `/generalSettings/ai/reviews?projects=${encodeURIComponent(
        projectUuid,
    )}`;

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
                    isLoadingPromptTrend={promptActivityQuery.isFetching}
                />
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
