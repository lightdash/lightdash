import { Badge, Box, Divider, Group, Loader, Stack, Text } from '@mantine/core';
import { IconCheck, IconClipboardList, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentEvaluationRunResults } from '../../hooks/useAiAgentEvaluations';
import { ToolCallPaper } from '../ChatElements/ToolCalls/ToolCallPaper';
import classes from './EvalAssessmentDisplay.module.css';
import { getAssessmentConfig } from './utils';

type EvalAssessmentDisplayProps = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
    runUuid: string;
    threadUuid: string;
};

export const EvalAssessmentDisplay: FC<EvalAssessmentDisplayProps> = ({
    projectUuid,
    agentUuid,
    evalUuid,
    runUuid,
    threadUuid,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { data, isLoading } = useAiAgentEvaluationRunResults(
        projectUuid,
        agentUuid,
        evalUuid,
        runUuid,
    );
    const { assessment, expectedResponse } = useMemo(() => {
        if (!data?.results) return { assessment: null, expectedResponse: null };
        const result = data.results.find((r) => r.threadUuid === threadUuid);
        return {
            assessment: result?.assessment ?? null,
            expectedResponse: result?.expectedResponse ?? null,
        };
    }, [data?.results, threadUuid]);

    if (isLoading)
        return (
            <>
                <Box m="sm">
                    <ToolCallPaper
                        title={t('evals.assessment.title')}
                        icon={IconClipboardList}
                        defaultOpened={false}
                    >
                        <Group align="center" justify="center" w="100%">
                            <Loader color="gray" size="sm" />
                        </Group>
                    </ToolCallPaper>
                </Box>
                <Divider />
            </>
        );

    if (!assessment) {
        return null;
    }

    const assessmentConfig = getAssessmentConfig(assessment.passed);

    return (
        <>
            <Box m="sm">
                <ToolCallPaper
                    title={t('evals.assessment.title')}
                    icon={IconClipboardList}
                    defaultOpened
                    rightAction={
                        <Badge
                            color={assessmentConfig.color}
                            variant="transparent"
                            leftSection={
                                <MantineIcon
                                    size={14}
                                    icon={assessment.passed ? IconCheck : IconX}
                                />
                            }
                        >
                            {t(assessmentConfig.labelKey)}
                        </Badge>
                    }
                >
                    {assessment.reason && (
                        <Text
                            size="xs"
                            className={classes.assessmentText}
                            mt="xs"
                        >
                            {assessment.reason}
                        </Text>
                    )}
                    {expectedResponse && (
                        <Stack gap={2} mt="sm">
                            <Text size="xs" fw={600} c="dimmed">
                                {t('evals.assessment.expectedResponse')}
                            </Text>
                            <Text
                                size="xs"
                                className={classes.assessmentText}
                                fs="italic"
                            >
                                {expectedResponse}
                            </Text>
                        </Stack>
                    )}
                </ToolCallPaper>
            </Box>
            <Divider />
        </>
    );
};
