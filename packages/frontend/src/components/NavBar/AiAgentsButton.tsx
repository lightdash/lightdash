import { Button, getDefaultZIndex, Group, Menu, Text } from '@mantine-8/core';
import { IconChevronDown, IconGitPullRequest } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { useAiAgentAdminReviewItems } from '../../ee/features/aiCopilot/hooks/useAiAgentAdmin';
import { useAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useAiAgentPermission } from '../../ee/features/aiCopilot/hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import MantineIcon from '../common/MantineIcon';
import classes from './AiAgentsButton.module.css';

type Props = {
    projectUuid: string;
};

export const AiAgentsButton = ({ projectUuid }: Props) => {
    const navigate = useNavigate();
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

    const projectReviewCount = useMemo(
        () =>
            (reviewItems ?? []).filter(
                (item) =>
                    item.projectUuid === projectUuid ||
                    item.latestFinding?.projectUuid === projectUuid,
            ).length,
        [projectUuid, reviewItems],
    );

    const reviewsUrl = `/generalSettings/ai/reviews?projects=${encodeURIComponent(
        projectUuid,
    )}`;
    const reviewCountLabel =
        projectReviewCount > 99 ? '99+' : `${projectReviewCount}`;

    if (!isVisible) {
        return null;
    }

    if (!showReviews) {
        return (
            <Button
                size="xs"
                variant="default"
                fz="sm"
                leftSection={<AiAgentIcon size={14} />}
                onClick={() => navigate(`/projects/${projectUuid}/ai-agents`)}
            >
                <Text span truncate="end" maw={150} size="sm">
                    Ask AI
                </Text>
            </Button>
        );
    }

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-start"
            arrowOffset={28}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            portalProps={{ target: '#navbar-header' }}
        >
            <Menu.Target>
                <Button
                    size="xs"
                    variant="default"
                    fz="sm"
                    leftSection={
                        <AiAgentIcon
                            size={15}
                            animated={projectReviewCount > 0}
                            className={classes.reviewIcon}
                        />
                    }
                    rightSection={
                        <Group gap={4} wrap="nowrap">
                            {projectReviewCount > 0 && (
                                <span className={classes.reviewCount}>
                                    {reviewCountLabel}
                                </span>
                            )}
                            <MantineIcon icon={IconChevronDown} size={12} />
                        </Group>
                    }
                    className={classes.reviewButton}
                >
                    <Group gap={6} wrap="nowrap">
                        <Text span truncate="end" maw={88} size="sm">
                            Ask AI
                        </Text>
                        <span className={classes.reviewPill}>Reviews</span>
                    </Group>
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<AiAgentIcon size={14} />}
                    onClick={() =>
                        navigate(`/projects/${projectUuid}/ai-agents`)
                    }
                >
                    Ask AI
                </Menu.Item>
                <Menu.Item
                    component={Link}
                    to={reviewsUrl}
                    leftSection={
                        <MantineIcon icon={IconGitPullRequest} size={14} />
                    }
                >
                    Review findings
                    {projectReviewCount > 0 && ` (${projectReviewCount} open)`}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
