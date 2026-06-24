import { ProjectType, type AiAgentModelConfig } from '@lightdash/common';
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
import { useEffect, useState, type FC } from 'react';
import {
    Link,
    useBlocker,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router';
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
    useProjectUploadAiAgentAvatarMutation,
    useProjectUpdateAiAgentMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useAgentAiMcpServers } from '../../features/aiCopilot/hooks/useProjectAiMcpServers';
import { EvalsSetup } from './EvalsSetup';

// Uploaded avatars open in upload mode (never expose the persistent file URL);
// user-provided URLs open in link mode.
const getAvatarModeForAgent = (
    agent:
        | { imageUrl: string | null; imageUrlSource: 'upload' | 'url' | null }
        | undefined,
): 'upload' | 'link' =>
    agent?.imageUrl && agent.imageUrlSource !== 'upload' ? 'link' : 'upload';

// Object URL lifecycle for a staged file: create on change, revoke on cleanup.
const useObjectUrl = (file: File | null): string | null => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!file) {
            setUrl(null);
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [file]);
    return url;
};

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
    mcpServerUuids: z.array(z.string()),
    enableDataAccess: z.boolean(),
    enableSelfImprovement: z.boolean(),
    enableContentTools: z.boolean(),
    adminOnly: z.boolean(),
    modelConfig: z.custom<AiAgentModelConfig>().nullable(),
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
    const { data: agentMcpServers, isFetched: isAgentMcpServersFetched } =
        useAgentAiMcpServers(projectUuid, actualAgentUuid);

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
            mcpServerUuids: [],
            enableDataAccess: true,
            enableSelfImprovement: false,
            enableContentTools: true,
            adminOnly: false,
            modelConfig: null,
            version: 2, // INFO: Default to v2 for now
        },
        validate: zodResolver(formSchema),
    });

    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarMode, setAvatarMode] = useState<'upload' | 'link'>('upload');
    const avatarPreviewUrl = useObjectUrl(avatarFile);

    useEffect(() => {
        if (isCreateMode || !agent || !isAgentMcpServersFetched) {
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
                mcpServerUuids: agentMcpServers?.map((mcp) => mcp.uuid) ?? [],
                enableDataAccess: agent.enableDataAccess ?? false,
                enableSelfImprovement: agent.enableSelfImprovement ?? false,
                enableContentTools:
                    (agent.enableDataAccess ?? false) &&
                    (agent.enableContentTools ?? false),
                adminOnly: agent.adminOnly ?? false,
                modelConfig: agent.modelConfig ?? null,
                version: agent.version ?? 2, // INFO: Default to v2 for now
            };
            form.setValues(values);
            form.resetDirty(values);
            setAvatarMode(getAvatarModeForAgent(agent));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, agentMcpServers, isAgentMcpServersFetched, isCreateMode]);

    // Derive activeTab from current pathname
    const activeTab = location.pathname.includes('/evals')
        ? 'evals'
        : location.pathname.includes('/verified-artifacts')
          ? 'verified-artifacts'
          : 'setup';

    const { mutateAsync: createAgent, isLoading: isCreatingAgent } =
        useProjectCreateAiAgentMutation(projectUuid!, {
            skipNavigation: true,
        });
    const { mutateAsync: updateAgent, isLoading: isUpdatingAgent } =
        useProjectUpdateAiAgentMutation(projectUuid!);
    const { mutateAsync: uploadAgentAvatar, isLoading: isUploadingAvatar } =
        useProjectUploadAiAgentAvatarMutation(projectUuid!);
    const handleSubmit = form.onSubmit(async (values) => {
        if (!projectUuid || !user?.data) {
            return;
        }

        if (isCreateMode) {
            const createdAgent = await createAgent({
                ...values,
                projectUuid,
            });
            let finalAgent = createdAgent;

            if (avatarFile) {
                try {
                    finalAgent = await uploadAgentAvatar({
                        agentUuid: createdAgent.uuid,
                        file: avatarFile,
                    });
                } catch {
                    finalAgent = createdAgent;
                }
            }

            setAvatarFile(null);
            const nextValues = {
                ...values,
                imageUrl: finalAgent.imageUrl,
            };
            form.setValues(nextValues);
            form.resetDirty(nextValues);
            void navigate(
                `/projects/${projectUuid}/ai-agents/${createdAgent.uuid}`,
            );
            return;
        }

        if (actualAgentUuid) {
            let finalAgent = await updateAgent({
                uuid: actualAgentUuid,
                projectUuid,
                ...values,
            });

            if (avatarFile) {
                try {
                    finalAgent = await uploadAgentAvatar({
                        agentUuid: actualAgentUuid,
                        file: avatarFile,
                    });
                } catch {
                    // upload mutation already shows an error toast
                }
            }

            setAvatarFile(null);
            const nextValues = {
                ...values,
                imageUrl: finalAgent.imageUrl,
            };
            form.setValues(nextValues);
            form.resetDirty(nextValues);
        }
    });

    const hasUnsavedChanges =
        (form.isDirty() || !!avatarFile) &&
        !isCreatingAgent &&
        !isUpdatingAgent &&
        !isUploadingAvatar;

    useBlocker(({ currentLocation, nextLocation }) => {
        if (
            !hasUnsavedChanges ||
            currentLocation.pathname === nextLocation.pathname
        ) {
            return false;
        }

        return !window.confirm(
            'You have unsaved changes to this agent. Are you sure you want to leave without saving?',
        );
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
                        variant="dotted"
                        p="xl"
                        shadow="subtle"
                        component={Stack}
                        gap="xxs"
                        align="center"
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
                            {(form.isDirty() || !!avatarFile) && (
                                <Button
                                    size="xs"
                                    disabled={
                                        (!form.isDirty() && !avatarFile) ||
                                        isCreatingAgent ||
                                        isUpdatingAgent ||
                                        isUploadingAvatar
                                    }
                                    loading={
                                        isCreatingAgent ||
                                        isUpdatingAgent ||
                                        isUploadingAvatar
                                    }
                                    onClick={() => handleSubmit()}
                                >
                                    Save changes
                                </Button>
                            )}
                        </Group>
                        <LightdashUserAvatar
                            name={isCreateMode ? '+' : form.values.name}
                            src={
                                !isCreateMode
                                    ? (avatarPreviewUrl ??
                                      form.values.imageUrl ??
                                      undefined)
                                    : (avatarPreviewUrl ?? undefined)
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
                                to={`/generalSettings/ai/threads?projects=${projectUuid}&agents=${actualAgentUuid}`}
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
                pb="emptySpace"
                mih={`calc(100vh - ${navbarHeight}px)`}
                bg="ldGray.0"
            >
                <Box>
                    {activeTab === 'setup' && (
                        <Box pt="sm" pr="sm">
                            <AiAgentFormSetup
                                mode={isCreateMode ? 'create' : 'edit'}
                                agentUuid={actualAgentUuid}
                                form={form}
                                projectUuid={projectUuid!}
                                isSavingAgent={
                                    isCreatingAgent ||
                                    isUpdatingAgent ||
                                    isUploadingAvatar
                                }
                                persistedMcpServerUuids={agentMcpServers?.map(
                                    (mcpServer) => mcpServer.uuid,
                                )}
                                avatarMode={avatarMode}
                                avatarFileName={avatarFile?.name ?? null}
                                onAvatarFileChange={(file) => {
                                    setAvatarFile(file);
                                    setAvatarMode('upload');
                                }}
                                onAvatarModeChange={(nextMode) => {
                                    if (nextMode === 'link') {
                                        setAvatarFile(null);
                                    }
                                    setAvatarMode(nextMode);
                                }}
                                onAvatarRemove={() => {
                                    setAvatarFile(null);
                                    form.setFieldValue('imageUrl', null);
                                    setAvatarMode('upload');
                                }}
                                onAvatarRevert={
                                    !isCreateMode &&
                                    (!!avatarFile ||
                                        (form.values.imageUrl ?? null) !==
                                            (agent?.imageUrl ?? null))
                                        ? () => {
                                              setAvatarFile(null);
                                              form.setFieldValue(
                                                  'imageUrl',
                                                  agent?.imageUrl ?? null,
                                              );
                                              setAvatarMode(
                                                  getAvatarModeForAgent(agent),
                                              );
                                          }
                                        : null
                                }
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
