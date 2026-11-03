import {
    assertUnreachable,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    type Job,
    type JobStep,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Code,
    Group,
    Loader,
    Paper,
    Progress,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconAlertTriangleFilled,
    IconCheck,
    IconCircleCheckFilled,
    IconExclamationMark,
    IconFileText,
    IconPlugConnected,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { jobStatusLabel, runningStepsInfo } from '../../hooks/useRefreshServer';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import MantineIcon from '../common/MantineIcon';
import classes from './CreateProjectJobProgress.module.css';

// Driver errors are cryptic, so name the field most likely to fix them
const getConnectionErrorHint = (error: string | undefined): string | null => {
    if (!error) return null;
    if (/\bssl\b|certificate|self[- ]signed/i.test(error))
        return 'The server rejected the SSL setting. Open Advanced, set SSL mode to disable or no-verify, and try again.';
    if (
        /password|authentication failed|incorrect username|access denied/i.test(
            error,
        )
    )
        return 'Check the user and password.';
    if (
        /enotfound|getaddrinfo|econnrefused|timed? ?out|could not connect/i.test(
            error,
        )
    )
        return "We couldn't reach the host. Check the host and port, and that the database accepts outside connections.";
    if (/does not exist|not found|unknown database/i.test(error))
        return 'Check the database and schema names.';
    return null;
};

const STEP_LABELS: Record<JobStepType, string> = {
    [JobStepType.TESTING_ADAPTOR]: 'Testing the connection',
    [JobStepType.COMPILING]: 'Reading your models',
    [JobStepType.CREATING_PROJECT]: 'Creating your project',
    [JobStepType.COPYING_PREVIEW_CONTENT]: 'Copying content',
    [JobStepType.CACHING]: 'Caching results',
    [JobStepType.SYNCING_CONTENT]: 'Syncing content',
};

type CardStatus = 'loading' | 'success' | 'error';

const toCardStatus = (status: JobStatusType): CardStatus => {
    switch (status) {
        case JobStatusType.STARTED:
        case JobStatusType.RUNNING:
            return 'loading';
        case JobStatusType.DONE:
            return 'success';
        case JobStatusType.ERROR:
            return 'error';
        default:
            return assertUnreachable(status, 'Unknown job status');
    }
};

const BADGE_ICONS: Record<CardStatus, Icon> = {
    loading: IconPlugConnected,
    success: IconCheck,
    error: IconAlertTriangle,
};

const StepGlyph: FC<{ step: JobStep }> = ({ step }) => {
    switch (step.stepStatus) {
        case JobStepStatusType.RUNNING:
            return <Loader size={12} color="gray" />;
        case JobStepStatusType.DONE:
            return <MantineIcon icon={IconCheck} size={12} />;
        case JobStepStatusType.ERROR:
            return <MantineIcon icon={IconExclamationMark} size={12} />;
        case JobStepStatusType.PENDING:
        case JobStepStatusType.SKIPPED:
            return null;
        default:
            return assertUnreachable(step.stepStatus, 'Unknown step status');
    }
};

/** The onboarding take on the create job: one card that names the warehouse */
export const OnboardingConnectionProgress: FC<{
    job: Job;
    warehouseLabel: string | null;
}> = ({ job, warehouseLabel }) => {
    const { setIsJobsDrawerOpen } = useActiveJob();
    const status = toCardStatus(job.jobStatus);
    const target = warehouseLabel ?? 'your warehouse';
    const failedStep = job.steps.find(
        (step) => step.stepStatus === JobStepStatusType.ERROR,
    );
    const errorHint = getConnectionErrorHint(failedStep?.stepError);

    const heading = {
        loading: {
            title: `Connecting to ${target}`,
            detail: 'This usually takes a few seconds.',
        },
        success: {
            title: `Connected to ${target}`,
            detail: 'Taking you to the next step.',
        },
        error: {
            title: `Couldn't connect to ${target}`,
            detail: 'Check the details below and try again.',
        },
    }[status];

    return (
        <Box
            className={classes.card}
            data-status={status}
            role={status === 'error' ? 'alert' : 'status'}
            aria-live="polite"
        >
            <Box className={classes.header}>
                <Box className={classes.badge}>
                    <MantineIcon icon={BADGE_ICONS[status]} size={18} />
                </Box>
                <Stack gap={2}>
                    <Text fw={600}>{heading.title}</Text>
                    <Text size="sm" c="dimmed">
                        {heading.detail}
                    </Text>
                </Stack>
            </Box>

            <Box component="ol" className={classes.steps}>
                {job.steps.map((step) => (
                    <Box
                        component="li"
                        key={step.stepType}
                        className={classes.step}
                        data-state={step.stepStatus}
                    >
                        <Box className={classes.stepGlyph}>
                            <StepGlyph step={step} />
                        </Box>
                        <Text size="sm">
                            {STEP_LABELS[step.stepType] ?? step.stepLabel}
                        </Text>
                    </Box>
                ))}
            </Box>

            {status === 'error' && (
                <Stack gap={4} className={classes.indented}>
                    {errorHint && <Text size="sm">{errorHint}</Text>}
                    <Code block className={classes.errorMessage}>
                        {failedStep?.stepError ??
                            'The connection failed without an error message.'}
                    </Code>
                    <Button
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        leftSection={
                            <MantineIcon icon={IconFileText} size={12} />
                        }
                        className={classes.logsButton}
                        onClick={() => setIsJobsDrawerOpen(true)}
                    >
                        View full logs
                    </Button>
                </Stack>
            )}
        </Box>
    );
};

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
        <Paper radius="md" p="md">
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
