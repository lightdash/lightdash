import { ExploreType, isSummaryExploreError } from '@lightdash/common';
import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { IconArrowUpRight, IconSparkles } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOptionalPendingPrompt } from '../../ee/features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { useAmbientAiEnabled } from '../../ee/features/ambientAi';
import { useExplores } from '../../hooks/useExplores';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import MantineIcon from '../common/MantineIcon';
import classes from './ExploreStarterQuestions.module.css';

const TEMPLATES = [
    (table: string) => `What are the key trends in ${table}?`,
    (table: string) => `How has ${table} changed over the last 12 months?`,
    (table: string) => `What stands out in ${table}?`,
];

/**
 * Questions to take to the AI agent instead of picking a table. Built from
 * table names, with no model call.
 */
const ExploreStarterQuestions: FC = () => {
    const projectUuid = useProjectUuid();
    const navigate = useNavigate();
    const isAmbientAiEnabled = useAmbientAiEnabled();
    const pendingPrompt = useOptionalPendingPrompt();
    const { data: explores } = useExplores(projectUuid, true, true);

    // ponytail: first tables alphabetically, rank by usage once that is tracked
    const questions = useMemo(
        () =>
            Object.values(explores ?? {})
                .filter(
                    (explore) =>
                        !isSummaryExploreError(explore) &&
                        (explore.type ?? ExploreType.DEFAULT) ===
                            ExploreType.DEFAULT,
                )
                .map((explore) => explore.label)
                .sort((a, b) => a.localeCompare(b))
                .slice(0, TEMPLATES.length)
                .map((label, index) => TEMPLATES[index](label)),
        [explores],
    );

    if (!isAmbientAiEnabled || !pendingPrompt || questions.length === 0) {
        return null;
    }

    return (
        <>
            <Box className={classes.card}>
                <Group gap={6} wrap="nowrap">
                    <MantineIcon icon={IconSparkles} size={14} stroke={1.75} />
                    <Text fz="sm" fw={600}>
                        Or ask a question
                    </Text>
                </Group>
                <Text fz="xs" c="dimmed" mt={2}>
                    Skip the table and ask in plain words.
                </Text>
                <Box className={classes.list}>
                    {questions.map((question) => (
                        <UnstyledButton
                            key={question}
                            className={classes.question}
                            onClick={() => {
                                pendingPrompt.setPendingPrompt(question);
                                void navigate(
                                    `/projects/${projectUuid}/ai-agents`,
                                );
                            }}
                        >
                            <Text fz="xs" flex={1}>
                                {question}
                            </Text>
                            <MantineIcon
                                icon={IconArrowUpRight}
                                size={12}
                                stroke={2}
                                className={classes.arrow}
                            />
                        </UnstyledButton>
                    ))}
                </Box>
            </Box>
        </>
    );
};

export default ExploreStarterQuestions;
