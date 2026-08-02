import { type AiAgentAdminEvalSummary } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Skeleton,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconExternalLink, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentAdminEvalPrompts } from '../../hooks/useAiAgentAdmin';
import { AgentNamePill } from '../AgentNamePill';
import { RunStatusIndicator, TimeAgo } from './EvalRunStatus';

const getAdminEvalUrl = (evalSummary: AiAgentAdminEvalSummary) =>
    `/projects/${evalSummary.project.uuid}/ai-agents/${evalSummary.agent.uuid}/edit/evals/${evalSummary.evalUuid}`;

const MetaField: FC<{ label: string; children: React.ReactNode }> = ({
    label,
    children,
}) => (
    <Stack gap={2}>
        <Text fz={10} fw={700} c="dimmed" tt="uppercase" lts={0.4}>
            {label}
        </Text>
        {children}
    </Stack>
);

type EvalPreviewSidebarProps = {
    evalSummary: AiAgentAdminEvalSummary;
    onClose: () => void;
};

export const EvalPreviewSidebar: FC<EvalPreviewSidebarProps> = ({
    evalSummary,
    onClose,
}) => {
    const { data, isInitialLoading } = useAiAgentAdminEvalPrompts(
        evalSummary.evalUuid,
    );
    const prompts = data?.prompts ?? [];
    const { latestRun } = evalSummary;

    return (
        <Stack gap={0} h="100%" bg="white">
            <Box p="lg">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4} miw={0}>
                        <Title order={5}>{evalSummary.title}</Title>
                        {evalSummary.description && (
                            <Text fz="sm" c="ldGray.6">
                                {evalSummary.description}
                            </Text>
                        )}
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                        <Button
                            component={Link}
                            to={getAdminEvalUrl(evalSummary)}
                            variant="default"
                            size="xs"
                            rightSection={
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size="sm"
                                />
                            }
                        >
                            Open eval
                        </Button>
                        <ActionIcon
                            variant="subtle"
                            color="ldGray.7"
                            onClick={onClose}
                            aria-label="Close eval preview"
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Group>
                </Group>
            </Box>
            <Divider color="ldGray.2" />

            <Group p="lg" gap="xl" align="flex-start">
                <MetaField label="Agent">
                    <AgentNamePill
                        name={evalSummary.agent.name}
                        imageUrl={evalSummary.agent.imageUrl}
                    />
                </MetaField>
                <MetaField label="Project">
                    <Text fz="sm" fw={500} c="ldGray.9">
                        {evalSummary.project.name}
                    </Text>
                </MetaField>
                <MetaField label="Latest run">
                    {latestRun ? (
                        <Group gap="xs" wrap="nowrap">
                            <RunStatusIndicator status={latestRun.status} />
                            <TimeAgo
                                date={
                                    latestRun.completedAt ?? latestRun.createdAt
                                }
                                fz="xs"
                                c="ldGray.6"
                            />
                        </Group>
                    ) : (
                        <Text fz="sm" fw={500} c="ldGray.5">
                            Never run
                        </Text>
                    )}
                </MetaField>
            </Group>
            <Divider color="ldGray.2" />

            <Box p="lg" flex={1} style={{ overflowY: 'auto', minHeight: 0 }}>
                <Text fz={10} fw={700} c="dimmed" tt="uppercase" lts={0.4}>
                    Prompts ({evalSummary.promptCount})
                </Text>
                {isInitialLoading ? (
                    <Stack gap="sm" mt="sm">
                        <Skeleton height={16} width="85%" />
                        <Skeleton height={16} width="70%" />
                        <Skeleton height={16} width="90%" />
                    </Stack>
                ) : (
                    <Stack gap={0} mt={4}>
                        {prompts.map((prompt, index) => (
                            <Group
                                key={prompt.evalPromptUuid}
                                gap="sm"
                                align="flex-start"
                                wrap="nowrap"
                                py="sm"
                                style={
                                    index < prompts.length - 1
                                        ? {
                                              borderBottom:
                                                  '1px solid var(--mantine-color-ldGray-2)',
                                          }
                                        : undefined
                                }
                            >
                                <Text
                                    fz="xs"
                                    fw={600}
                                    c="ldGray.5"
                                    w={20}
                                    ta="right"
                                    style={{ flexShrink: 0 }}
                                >
                                    {index + 1}
                                </Text>
                                <Stack gap={2} miw={0}>
                                    <Text fz="sm" lh={1.5} c="ldGray.9">
                                        {prompt.prompt ??
                                            'Prompt no longer available'}
                                    </Text>
                                    {prompt.expectedResponse && (
                                        <Text fz="xs" c="ldGray.6" lh={1.5}>
                                            Expected: {prompt.expectedResponse}
                                        </Text>
                                    )}
                                </Stack>
                            </Group>
                        ))}
                    </Stack>
                )}
            </Box>
        </Stack>
    );
};
