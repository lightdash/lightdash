import { ExploreType, isSummaryExploreError } from '@lightdash/common';
import { Stack, Text, UnstyledButton } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOptionalPendingPrompt } from '../../ee/features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { useAmbientAiEnabled } from '../../ee/features/ambientAi';
import { useExplores } from '../../hooks/useExplores';
import { useProjectUuid } from '../../hooks/useProjectUuid';
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
        <Stack gap={6} align="flex-start" className={classes.root}>
            <Text fz={11} fw={500} c="dimmed" pl={2}>
                Or ask a question
            </Text>
            {questions.map((question) => (
                <UnstyledButton
                    key={question}
                    className={classes.question}
                    onClick={() => {
                        pendingPrompt.setPendingPrompt(question);
                        void navigate(`/projects/${projectUuid}/ai-agents`);
                    }}
                >
                    {question}
                </UnstyledButton>
            ))}
        </Stack>
    );
};

export default ExploreStarterQuestions;
