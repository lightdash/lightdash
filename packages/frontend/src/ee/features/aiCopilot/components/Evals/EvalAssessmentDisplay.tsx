import { Badge, Box, Divider, Group, Loader, Text } from '@mantine-8/core';
import { IconCheck, IconClipboardList, IconX } from '@tabler/icons-react';
import { type FC, useMemo } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentEvaluationRunResults } from '../../hooks/useAiAgentEvaluations';
import { ToolCallPaper } from '../ChatElements/ToolCalls/ToolCallPaper';
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
    const { data, isLoading } = useAiAgentEvaluationRunResults(
        projectUuid,
        agentUuid,
        evalUuid,
        runUuid,
    );
    const assessment = useMemo(() => {
        if (!data?.results || !threadUuid) return null;
        const result = data.results.find((r) => r.threadUuid === threadUuid);
        return result?.assessment ?? null;
    }, [data?.results, threadUuid]);

    if (isLoading)
        return (
            <>
                <Box m="sm">
                    <ToolCallPaper
                        title="Evaluation Assessment"
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
                    title="Evaluation Assessment"
                    icon={IconClipboardList}
                    defaultOpened
                    rightAction={
                        <Badge
                            color={assessmentConfig.color}
                            variant="white"
                            leftSection={
                                <MantineIcon
                                    size={14}
                                    icon={assessment.passed ? IconCheck : IconX}
                                />
                            }
                        >
                            {assessmentConfig.label}
                        </Badge>
                    }
                >
                    {assessment.reason && (
                        <Text
                            size="xs"
                            style={{ whiteSpace: 'pre-wrap' }}
                            mt="xs"
                        >
                            {assessment.reason}
                        </Text>
                    )}
                </ToolCallPaper>
            </Box>
            <Divider />
        </>
    );
};
