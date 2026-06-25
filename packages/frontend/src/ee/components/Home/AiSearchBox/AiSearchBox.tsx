import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Skeleton,
    Text,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconArrowUp,
    IconArrowRight,
    IconCornerDownLeft,
    IconGitPullRequest,
    IconSettings,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Provider } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import { CategoryBadge } from '../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../components/common/PolymorphicGroupButton';
import { CompactAgentSelector } from '../../../features/aiCopilot/components/AgentSelector';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../../../features/aiCopilot/components/AgentSelector/AgentSelectorUtils';
import { AiAgentIcon } from '../../../features/aiCopilot/components/AiAgentIcon';
import { usePendingPrompt } from '../../../features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { useAiAgentAdminReviewItems } from '../../../features/aiCopilot/hooks/useAiAgentAdmin';
import {
    useAiAgentOrgPermission,
    useAiAgentPermission,
} from '../../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../../features/aiCopilot/hooks/useAiOrganizationSettings';
import { useAiRouterConfig } from '../../../features/aiCopilot/hooks/useAiRouter';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../../features/aiCopilot/hooks/useUserAgentPreferences';
import { store } from '../../../features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../../features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';
import styles from './aiSearchBox.module.css';
import { SearchDropdown } from './SearchDropdown';

type Props = {
    projectUuid: string;
    showAiReviewsPromo?: boolean;
};

const AiSearchBoxInner: FC<Props> = ({
    projectUuid,
    showAiReviewsPromo = false,
}) => {
    const navigate = useNavigate();

    const { data: agents, isLoading: isLoadingAgents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const isTrial =
        aiOrganizationSettingsQuery.isSuccess &&
        aiOrganizationSettingsQuery.data.isTrial;
    const reviewsEnabled =
        aiOrganizationSettingsQuery.data?.aiAgentReviewsEnabled === true;
    const {
        data: userAgentPreferences,
        isLoading: isLoadingUserAgentPreferences,
    } = useGetUserAgentPreferences(projectUuid);
    const aiRouterConfigQuery = useAiRouterConfig();
    const [selectedAgentUuid, setSelectedAgentUuid] = useState<string>();
    const { setPendingPrompt } = usePendingPrompt();
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const canViewReviews = useAiAgentOrgPermission({
        action: 'manage',
    });
    const showReviewsPromo =
        showAiReviewsPromo && canViewReviews && reviewsEnabled;
    const { data: reviewItems } = useAiAgentAdminReviewItems(
        { statuses: ['open'] },
        { enabled: showReviewsPromo },
    );
    const projectReviewItems =
        reviewItems?.filter(
            (item) =>
                item.projectUuid === projectUuid ||
                item.latestFinding?.projectUuid === projectUuid,
        ) ?? [];
    const prReadyCount = projectReviewItems.filter(
        (item) => item.writebackEligibility.eligible,
    ).length;
    const linkedPrCount = projectReviewItems.filter(
        (item) => !!item.linkedPrUrl,
    ).length;
    const reviewsPromoLabel =
        prReadyCount > 0
            ? 'Review findings, ship PRs, improve agents'
            : 'Review AI findings to improve future answers';

    const noAgentsAvailable =
        !isLoadingAgents && (!agents || agents.length === 0);
    const showAgentSetupPrompt =
        canManageAgents && (isTrial || noAgentsAvailable);
    const showFooter = canManageAgents || showReviewsPromo;

    const showAutoOption =
        (agents?.length ?? 0) > 1 && aiRouterConfigQuery.data?.enabled === true;

    const validDefaultAgent = agents?.find(
        (agent) => agent.uuid === userAgentPreferences?.defaultAgentUuid,
    );
    const preferredSelection =
        validDefaultAgent ?? (showAutoOption ? 'auto' : agents?.[0]);

    const selectedAgent =
        selectedAgentUuid === AI_ROUTING_AUTO_VALUE && showAutoOption
            ? 'auto'
            : agents?.find((agent) => agent.uuid === selectedAgentUuid);
    const activeSelection = selectedAgent ?? preferredSelection;

    const form = useForm({
        initialValues: {
            prompt: '',
        },
    });

    const { mutateAsync: createAgentThread } =
        useCreateAgentThreadMutation(projectUuid);

    const handleSubmit = form.onSubmit(async (values) => {
        const prompt = values.prompt.trim();

        if (!prompt) return;

        if (activeSelection === 'auto') {
            setPendingPrompt(prompt);
            void navigate(
                {
                    pathname: `/projects/${projectUuid}/ai-agents`,
                    search: new URLSearchParams({
                        [AI_ROUTING_SEARCH_PARAM]: AI_ROUTING_AUTO_VALUE,
                    }).toString(),
                },
                {
                    state: { autoSubmitPrompt: prompt },
                    viewTransition: true,
                },
            );
        } else if (!activeSelection) {
            void navigate(`/projects/${projectUuid}/ai-agents`);
        } else {
            await createAgentThread({
                agentUuid: activeSelection.uuid,
                prompt,
            });
        }
    });

    const handleSearchItemSelect = () => {
        form.reset();
    };

    const onSelect = (agentUuid: string) => {
        if (!agents) return;
        if (agentUuid === AI_ROUTING_AUTO_VALUE && showAutoOption) {
            setSelectedAgentUuid(AI_ROUTING_AUTO_VALUE);
            return;
        }

        if (agents.some((agent) => agent.uuid === agentUuid)) {
            setSelectedAgentUuid(agentUuid);
        }
    };

    if (
        isLoadingAgents ||
        isLoadingUserAgentPreferences ||
        aiRouterConfigQuery.isLoading
    ) {
        return (
            <Paper style={{ overflow: 'hidden' }} p="md">
                <Group wrap="nowrap" align="center">
                    <Skeleton circle height={38} width={38} />
                    <Skeleton height={36} flex={1} />
                    <Skeleton circle height={28} width={28} />
                </Group>
            </Paper>
        );
    }

    if (!agents) {
        return null;
    }

    return (
        <Paper
            classNames={{
                root: styles.paperRoot,
            }}
        >
            <Box p="md">
                <form onSubmit={handleSubmit}>
                    <Group>
                        <CompactAgentSelector
                            agents={agents}
                            selectedAgent={activeSelection ?? agents[0]}
                            onSelect={onSelect}
                            showAutoOption={showAutoOption}
                        />
                        <Group gap="xs" flex={1}>
                            <SearchDropdown
                                projectUuid={projectUuid}
                                value={form.values.prompt}
                                onChange={(value) =>
                                    form.setFieldValue('prompt', value)
                                }
                                onSearchItemSelect={handleSearchItemSelect}
                                placeholder={
                                    activeSelection === 'auto'
                                        ? 'Ask AI or search your data'
                                        : activeSelection
                                          ? `Ask ${activeSelection.name} or search your data`
                                          : 'Search your data'
                                }
                                onHeaderClick={handleSubmit}
                                header={
                                    <PolymorphicGroupButton
                                        p="sm"
                                        className={styles.askAiSection}
                                        gap="xs"
                                        wrap="nowrap"
                                        style={{ overflow: 'hidden' }}
                                        align="flex-start"
                                    >
                                        <AiAgentIcon
                                            style={{
                                                flexShrink: 0,
                                                marginTop: 4,
                                            }}
                                            size={14}
                                        />
                                        <Text
                                            size="sm"
                                            c="foreground"
                                            flex="1"
                                            mt={2}
                                        >
                                            Ask{' '}
                                            {activeSelection === 'auto'
                                                ? 'AI'
                                                : activeSelection
                                                  ? activeSelection.name
                                                  : 'AI'}
                                            :{' '}
                                            <Text
                                                component="span"
                                                fw={600}
                                                c="ldDark.9"
                                            >
                                                "{form.values.prompt.trim()}"
                                            </Text>
                                        </Text>
                                        <Box
                                            className={styles.askAiSectionArrow}
                                            p={4}
                                        >
                                            <MantineIcon
                                                icon={IconCornerDownLeft}
                                                size={16}
                                                color="violet.4"
                                            />
                                        </Box>
                                    </PolymorphicGroupButton>
                                }
                            />
                            <ActionIcon
                                type="submit"
                                disabled={!form.values.prompt.trim()}
                                classNames={{
                                    root: styles.actionIcon,
                                    icon: styles.actionIconIcon,
                                }}
                            >
                                <MantineIcon icon={IconArrowUp} />
                            </ActionIcon>
                        </Group>
                    </Group>
                </form>
            </Box>
            {showFooter && (
                <>
                    <Divider color="ldGray.2" />
                    <Box bg="ldGray.0" px="md" py="5px">
                        <Group flex={1} justify="space-between">
                            <Group gap="xs">
                                {showAgentSetupPrompt && noAgentsAvailable ? (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        leftSection={<AiAgentIcon size={14} />}
                                        component={Link}
                                        to="/ai-agents"
                                    >
                                        <Group gap={2}>
                                            {isTrial && (
                                                <Text size="xs" c="ldGray.8">
                                                    You are trialing the AI
                                                    Agents feature.
                                                </Text>
                                            )}{' '}
                                            <Text size="xs" fw={500}>
                                                Set up your first agent to get
                                                started
                                            </Text>
                                        </Group>
                                    </Button>
                                ) : showAgentSetupPrompt && isTrial ? (
                                    <Group gap="xs">
                                        <AiAgentIcon size={14} />
                                        <Text size="xs" c="ldGray.8">
                                            You are trialing the AI Agents
                                            feature.
                                        </Text>
                                    </Group>
                                ) : null}

                                {showReviewsPromo && (
                                    <Button
                                        size="compact-xs"
                                        variant="transparent"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconGitPullRequest}
                                                color="ldGray.7"
                                                strokeWidth={1.7}
                                            />
                                        }
                                        rightSection={
                                            <MantineIcon
                                                icon={IconArrowRight}
                                                size={13}
                                                color="ldGray.7"
                                            />
                                        }
                                        component={Link}
                                        to={`/generalSettings/ai/reviews?projects=${projectUuid}`}
                                        className={styles.reviewsPromoButton}
                                    >
                                        <Group gap="xs" wrap="nowrap">
                                            <Text span fz="xs" fw={700}>
                                                {reviewsPromoLabel}
                                            </Text>
                                            <CategoryBadge
                                                label={`${projectReviewItems.length} open`}
                                                color="yellow.5"
                                                className={
                                                    styles.reviewsPromoBadge
                                                }
                                            />
                                            <CategoryBadge
                                                label={`${prReadyCount} PR-ready`}
                                                color="green.5"
                                                className={
                                                    styles.reviewsPromoBadge
                                                }
                                            />
                                            {linkedPrCount > 0 && (
                                                <CategoryBadge
                                                    label={`${linkedPrCount} linked`}
                                                    color="blue.5"
                                                    className={
                                                        styles.reviewsPromoBadge
                                                    }
                                                />
                                            )}
                                        </Group>
                                    </Button>
                                )}
                            </Group>

                            {canManageAgents && (
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    leftSection={
                                        <MantineIcon
                                            color="ldGray.7"
                                            icon={IconSettings}
                                            strokeWidth={1.5}
                                        />
                                    }
                                    component={Link}
                                    to="/generalSettings/ai/agents"
                                    classNames={{
                                        label: styles.adminSettingsButtonLabel,
                                        section:
                                            styles.adminSettingsButtonSection,
                                    }}
                                >
                                    Admin Settings
                                </Button>
                            )}
                        </Group>
                    </Box>
                </>
            )}
        </Paper>
    );
};

const AiSearchBox: FC<Props> = (props) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <AiSearchBoxInner {...props} />
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);

export default AiSearchBox;
