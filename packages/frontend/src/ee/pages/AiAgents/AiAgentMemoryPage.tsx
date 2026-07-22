import {
    Anchor,
    Box,
    Divider,
    Group,
    Paper,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import PageSpinner from '../../../components/PageSpinner';
import { MemoryDetails } from '../../features/aiCopilot/components/MemoryDetails/MemoryDetails';
import { useAiAgentMemory } from '../../features/aiCopilot/hooks/useAiAgentMemory';
import styles from './AiAgentMemoryPage.module.css';

const AiAgentMemoryPage = () => {
    const { projectUuid, agentUuid, slug } = useParams();
    const memoryQuery = useAiAgentMemory({ projectUuid, agentUuid, slug });

    if (!projectUuid || !agentUuid || !slug) return <ErrorState />;
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

                <Paper withBorder radius="lg" className={styles.surface}>
                    <Group className={styles.header} wrap="nowrap">
                        <Text
                            component="h1"
                            className={styles.title}
                            lineClamp={2}
                        >
                            {memoryQuery.data.title}
                        </Text>
                    </Group>
                    <Divider />
                    <Box className={styles.body}>
                        <MemoryDetails
                            memory={memoryQuery.data}
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                        />
                    </Box>
                </Paper>
            </Stack>
        </Box>
    );
};

export default AiAgentMemoryPage;
