import { Anchor, Box, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import PageSpinner from '../../../components/PageSpinner';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { MemoryActions } from '../../features/aiCopilot/components/MemoryDetails/MemoryActions';
import { MemoryDetails } from '../../features/aiCopilot/components/MemoryDetails/MemoryDetails';
import {
    useAiAgentMemory,
    useMyAiAgentMemory,
} from '../../features/aiCopilot/hooks/useAiAgentMemory';
import styles from './AiAgentMemoryPage.module.css';

const AiAgentMemoryPage = () => {
    const { agentUuid, slug } = useParams();
    const projectUuid = useProjectUuid();
    const agentMemoryQuery = useAiAgentMemory({
        projectUuid,
        agentUuid,
        slug,
        enabled: Boolean(agentUuid),
    });
    const projectMemoryQuery = useMyAiAgentMemory({
        projectUuid,
        slug,
        enabled: !agentUuid,
    });
    const memoryQuery = agentUuid ? agentMemoryQuery : projectMemoryQuery;

    if (!projectUuid || !slug) return <ErrorState />;
    if (memoryQuery.isLoading) return <PageSpinner />;
    if (memoryQuery.isError || !memoryQuery.data) {
        return <ErrorState error={memoryQuery.error?.error} />;
    }

    return (
        <Box className={styles.page}>
            <Stack gap="lg" maw={1160} mx="auto">
                <Anchor
                    component={Link}
                    to={`/projects/${projectUuid}/ai-agents`}
                    className={styles.backLink}
                >
                    <IconArrowLeft size={14} />
                    Back to AI agents
                </Anchor>

                <Paper className={styles.surface}>
                    <Group
                        className={styles.header}
                        wrap="nowrap"
                        justify="space-between"
                    >
                        <Text
                            component="h1"
                            className={styles.title}
                            lineClamp={2}
                        >
                            {memoryQuery.data.title}
                        </Text>
                        <MemoryActions
                            projectUuid={projectUuid}
                            memory={memoryQuery.data}
                        />
                    </Group>
                    <Divider />
                    <MemoryDetails
                        memory={memoryQuery.data}
                        projectUuid={projectUuid}
                        agentUuid={agentUuid ?? null}
                    />
                </Paper>
            </Stack>
        </Box>
    );
};

export default AiAgentMemoryPage;
