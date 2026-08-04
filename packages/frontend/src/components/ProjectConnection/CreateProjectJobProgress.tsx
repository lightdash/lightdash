import {
    JobStatusType,
    JobStepStatusType,
    type Job,
    type JobStep,
} from '@lightdash/common';
import {
    Alert,
    Group,
    Loader,
    Paper,
    Progress,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { jobStatusLabel, runningStepsInfo } from '../../hooks/useRefreshServer';
import MantineIcon from '../common/MantineIcon';

const StepIcon: FC<{ step: JobStep }> = ({ step }) => {
    switch (step.stepStatus) {
        case JobStepStatusType.ERROR:
            return <MantineIcon icon={IconAlertTriangleFilled} color="red" />;
        case JobStepStatusType.DONE:
            return <MantineIcon icon={IconCircleCheckFilled} color="green" />;
        case JobStepStatusType.RUNNING:
            return <Loader color="gray" size={16} />;
        case JobStepStatusType.SKIPPED:
        case JobStepStatusType.PENDING:
            return <MantineIcon icon={IconCircleCheckFilled} color="gray.3" />;
        default:
            return null;
    }
};

const CreateProjectJobProgress: FC<{ job: Job }> = ({ job }) => {
    const hasFailed = job.jobStatus === JobStatusType.ERROR;
    const isDone = job.jobStatus === JobStatusType.DONE;
    const { completedStepsMessage, numberOfCompletedSteps, totalSteps } =
        runningStepsInfo(job.steps);
    const failedStep = job.steps.find(
        (step) => step.stepStatus === JobStepStatusType.ERROR,
    );

    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
                <Group gap="xs" wrap="nowrap">
                    {!hasFailed && !isDone && <Loader color="gray" size="sm" />}
                    {isDone && (
                        <MantineIcon
                            icon={IconCircleCheckFilled}
                            color="green"
                        />
                    )}
                    <Text fw={600}>
                        {jobStatusLabel(job.jobStatus, job.jobType)}
                    </Text>
                </Group>

                {totalSteps > 0 && (
                    <Stack gap={4}>
                        <Progress
                            value={(numberOfCompletedSteps / totalSteps) * 100}
                            color={hasFailed ? 'red' : undefined}
                            size="sm"
                        />
                        <Text size="xs" c="dimmed">
                            {`${completedStepsMessage} steps complete`}
                        </Text>
                    </Stack>
                )}

                <Stack gap="xs">
                    {job.steps.map((step) => (
                        <Group key={step.stepLabel} gap="xs" wrap="nowrap">
                            <StepIcon step={step} />
                            <Text
                                size="sm"
                                c={
                                    step.stepStatus ===
                                    JobStepStatusType.PENDING
                                        ? 'dimmed'
                                        : undefined
                                }
                            >
                                {step.stepLabel}
                            </Text>
                        </Group>
                    ))}
                </Stack>

                {hasFailed && (
                    <Alert color="red" title="We couldn't create your project">
                        <Text size="sm">
                            {failedStep?.stepError ??
                                'Check your connection details and try again.'}
                        </Text>
                    </Alert>
                )}
            </Stack>
        </Paper>
    );
};

export default CreateProjectJobProgress;
