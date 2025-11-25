import { ProjectType } from '@lightdash/common';
import {
    AppShell,
    Box,
    Button,
    Container,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconAdjustmentsAlt,
    IconArrowLeft,
    IconBook2,
    IconCircleCheck,
    IconMessageCircleShare,
} from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    BANNER_HEIGHT,
    NAVBAR_HEIGHT,
} from '../../../components/common/Page/constants';
import { useProjects } from '../../../hooks/useProjects';
import useApp from '../../../providers/App/useApp';
import { VerifiedArtifactDetail } from '../../features/aiCopilot/components/Admin/VerifiedArtifactDetail';
import { VerifiedArtifactsLayout } from '../../features/aiCopilot/components/Admin/VerifiedArtifactsLayout';
import { AiAgentFormSetup } from '../../features/aiCopilot/components/AiAgentFormSetup';
import { EvalDetail } from '../../features/aiCopilot/components/Evals/EvalDetail';
import { EvalRunDetails } from '../../features/aiCopilot/components/Evals/EvalRunDetails';
import { EvalSectionLayout } from '../../features/aiCopilot/components/Evals/EvalSectionLayout';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import {
    useProjectAiAgent,
    useProjectCreateAiAgentMutation,
    useProjectUpdateAiAgentMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { EvalsSetup } from './EvalsSetup';

const formSchema = z.object({
    name: z.string().min(1),
    description: z.string().nullable(),
    integrations: z.array(
        z.object({
            type: z.literal('slack'),
            channelId: z.string().min(1),
        }),
    ),
    tags: z.array(z.string()).nullable(),
    instruction: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
    groupAccess: z.array(z.string()),
    userAccess: z.array(z.string()),
    spaceAccess: z.array(z.string()),
    enableDataAccess: z.boolean(),
    enableSelfImprovement: z.boolean(),
    enableReasoning: z.boolean(),
    version: z.number(),
});

type Props = {
    isCreateMode?: boolean;
};

const ProjectAiAgentEditPage: FC<Props> = ({ isCreateMode = false }) => {
    const navigate = useNavigate();
    const { agentUuid, projectUuid, evalUuid, runUuid, artifactUuid } =
        useParams<{
            agentUuid: string;
            projectUuid: string;
            evalUuid?: string;
            runUuid?: string;
            artifactUuid?: string;
        }>();
    const location = useLocation();
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const { data: projects } = useProjects();
    const isCurrentProjectPreview = !!projects?.find(
        (project) =>
            project.projectUuid === projectUuid &&
            project.type === ProjectType.PREVIEW,
    );
    const { user } = useApp();

    const actualAgentUuid = !isCreateMode && agentUuid ? agentUuid : undefined;
    const { data: agent, isLoading: isLoadingAgent } = useProjectAiAgent(
        projectUuid,
        actualAgentUuid,
    );

    const form = useForm<z.infer<typeof formSchema>>({
        initialValues: {
            name: '',
            description: null,
            integrations: [],
            tags: null,
            instruction: null,
            imageUrl: null,
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            enableDataAccess: false,
            enableSelfImprovement: false,
            enableReasoning: false,
            version: 2, // INFO: Default to v2 for now
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (isCreateMode || !agent) {
            return;
        }

        if (!form.initialized) {
            const values = {
                name: agent.name,
                description: agent.description,
                integrations: agent.integrations,
                tags: agent.tags && agent.tags.length > 0 ? agent.tags : null,
                instruction: agent.instruction,
                imageUrl: agent.imageUrl,
                groupAccess: agent.groupAccess ?? [],
                userAccess: agent.userAccess ?? [],
                spaceAccess: agent.spaceAccess ?? [],
                enableDataAccess: agent.enableDataAccess ?? false,
                enableSelfImprovement: agent.enableSelfImprovement ?? false,
                enableReasoning: agent.enableReasoning ?? false,
                version: agent.version ?? 2, // INFO: Default to v2 for now
            };
            form.setValues(values);
            form.resetDirty(values);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, isCreateMode]);

    // Derive activeTab from current pathname
    const activeTab = location.pathname.includes('/evals')
        ? 'evals'
        : location.pathname.includes('/verified-artifacts')
        ? 'verified-artifacts'
        : 'setup';

    const { mutateAsync: createAgent } = useProjectCreateAiAgentMutation(
        projectUuid!,
    );
    const { mutateAsync: updateAgent } = useProjectUpdateAiAgentMutation(
        projectUuid!,
    );
    const handleSubmit = form.onSubmit(async (values) => {
        if (!projectUuid || !user?.data) {
            return;
        }

        if (isCreateMode) {
            await createAgent({
                ...values,
                projectUuid,
            });
        }

        if (actualAgentUuid) {
            await updateAgent({
                uuid: actualAgentUuid,
                projectUuid,
                ...values,
            });
        }
    });

    useEffect(() => {
        if (!canManageAgents) {
            void navigate(`/projects/${projectUuid}/ai-agents`);
        }
    }, [canManageAgents, navigate, projectUuid]);

    const navbarHeight =
        NAVBAR_HEIGHT + (isCurrentProjectPreview ? BANNER_HEIGHT : 0);

    if (!isCreateMode && actualAgentUuid && !agent && !isLoadingAgent) {
        return (
            <Container py="xl">
                <Stack gap="md">
                    <Group gap="xs">
                        <Button
                            variant="subtle"
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                            onClick={() =>
                                navigate(`/projects/${projectUuid}/ai-agents`)
                            }
                        >
                            Back to Agents
                        </Button>
                    </Group>
                    <Paper
                        p="xl"
                        shadow="subtle"
                        component={Stack}
                        gap="xxs"
                        align="center"
                        withBorder
                        style={{ borderStyle: 'dashed' }}
                    >
                        <Title order={5}>Agent not found</Title>
                        <Text size="sm" c="dimmed">
                            The agent you are looking for does not exist.
                        </Text>
                    </Paper>
                </Stack>
            </Container>
        );
    }

    return (
        <AppShell
            padding="md"
            header={{
                height: navbarHeight,
            }}
            navbar={{
                width: 300,
                breakpoint: 'sm',
            }}
            bg="#fcfcfc"
        >
            <AppShell.Navbar p="md">
                <Stack gap="lg">
                    <Stack gap="md" align="center">
                        <Group justify="space-between" w="100%">
                            <Button
                                variant="subtle"
                                color="ldGray.4"
                                size="xs"
                                leftSection={
                                    <MantineIcon icon={IconArrowLeft} />
                                }
                                onClick={() => {
                                    if (isCreateMode) {
                                        void navigate(
                                            `/projects/${projectUuid}/ai-agents`,
                                        );
                                    } else {
                                        void navigate(
                                            `/projects/${projectUuid}/ai-agents/${actualAgentUuid}`,
                                        );
                                    }
                                }}
                            >
                                Back
                            </Button>
                            {form.isDirty() && (
                                <Button
                                    size="xs"
                                    disabled={!form.isDirty()}
                                    onClick={() => handleSubmit()}
                                >
                                    Save changes
                                </Button>
                            )}
                        </Group>
                        <LightdashUserAvatar
                            name={isCreateMode ? '+' : form.values.name}
                            src={
                                !isCreateMode ? form.values.imageUrl : undefined
                            }
                            size={80}
                        />
                        <Stack gap="xs" align="center">
                            <Title order={4} ta="center" lineClamp={2}>
                                {isCreateMode
                                    ? 'New Agent'
                                    : agent?.name || 'Agent'}
                            </Title>
                        </Stack>
                    </Stack>

                    <Stack gap="xs">
                        <Button
                            variant={activeTab === 'setup' ? 'light' : 'subtle'}
                            fullWidth
                            justify="flex-start"
                            leftSection={
                                <MantineIcon icon={IconAdjustmentsAlt} />
                            }
                            onClick={() => {
                                if (isCreateMode) {
                                    // In create mode, we can't navigate to agent-specific routes
                                    return;
                                }
                                void navigate(
                                    `/projects/${projectUuid}/ai-agents/${actualAgentUuid}/edit`,
                                );
                            }}
                        >
                            Setup
                        </Button>
                        {!isCreateMode && (
                            <Button
                                variant={
                                    activeTab === 'evals' ? 'light' : 'subtle'
                                }
                                fullWidth
                                justify="flex-start"
                                leftSection={<MantineIcon icon={IconBook2} />}
                                onClick={() => {
                                    void navigate(
                                        `/projects/${projectUuid}/ai-agents/${actualAgentUuid}/edit/evals`,
                                    );
                                }}
                            >
                                Evals
                            </Button>
                        )}
                        {!isCreateMode && (
                            <Button
                                variant={
                                    activeTab === 'verified-artifacts'
                                        ? 'light'
                                        : 'subtle'
                                }
                                fullWidth
                                justify="flex-start"
                                leftSection={
                                    <MantineIcon icon={IconCircleCheck} />
                                }
                                onClick={() => {
                                    void navigate(
                                        `/projects/${projectUuid}/ai-agents/${actualAgentUuid}/edit/verified-artifacts`,
                                    );
                                }}
                            >
                                Verified Answers
                            </Button>
                        )}
                        {!isCreateMode && (
                            <Button
                                fullWidth
                                variant="subtle"
                                justify="flex-start"
                                leftSection={
                                    <MantineIcon
                                        icon={IconMessageCircleShare}
                                    />
                                }
                                component={Link}
                                to={`/ai-agents/admin?projects=${projectUuid}&agents=${actualAgentUuid}`}
                            >
                                Conversations
                            </Button>
                        )}
                    </Stack>
                </Stack>
            </AppShell.Navbar>
            <AppShell.Main
                pt={0}
                pr={0}
                pb={0}
                mih={`calc(100vh - ${navbarHeight}px)`}
                bg="ldGray.0"
            >
                <Box>
                    {activeTab === 'setup' && (
                        <Box pt="sm" pr="sm">
                            <AiAgentFormSetup
                                mode={isCreateMode ? 'create' : 'edit'}
                                agentUuid={actualAgentUuid!}
                                form={form}
                                projectUuid={projectUuid!}
                            />
                        </Box>
                    )}

                    {activeTab === 'evals' && (
                        <EvalSectionLayout>
                            {runUuid ? (
                                <EvalRunDetails
                                    projectUuid={projectUuid!}
                                    agentUuid={actualAgentUuid!}
                                    evalUuid={evalUuid!}
                                    runUuid={runUuid}
                                />
                            ) : evalUuid ? (
                                <EvalDetail
                                    projectUuid={projectUuid!}
                                    agentUuid={actualAgentUuid!}
                                    evalUuid={evalUuid}
                                />
                            ) : (
                                <EvalsSetup
                                    projectUuid={projectUuid!}
                                    agentUuid={actualAgentUuid!}
                                />
                            )}
                        </EvalSectionLayout>
                    )}

                    {activeTab === 'verified-artifacts' && (
                        <>
                            {artifactUuid ? (
                                <VerifiedArtifactDetail />
                            ) : (
                                <VerifiedArtifactsLayout />
                            )}
                        </>
                    )}
                </Box>
            </AppShell.Main>
        </AppShell>
    );
};

export default ProjectAiAgentEditPage;
