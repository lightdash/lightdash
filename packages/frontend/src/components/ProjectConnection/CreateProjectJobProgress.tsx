import {
    assertUnreachable,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    type Job,
    type JobStep,
} from '@lightdash/common';
import { Box, Button, Code, Loader, Stack, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconExclamationMark,
    IconFileText,
    IconPlugConnected,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import MantineIcon from '../common/MantineIcon';
import classes from './CreateProjectJobProgress.module.css';

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

const CreateProjectJobProgress: FC<{
    job: Job;
    warehouseLabel: string | null;
}> = ({ job, warehouseLabel }) => {
    const { setIsJobsDrawerOpen } = useActiveJob();
    const status = toCardStatus(job.jobStatus);
    const target = warehouseLabel ?? 'your warehouse';
    const failedStep = job.steps.find(
        (step) => step.stepStatus === JobStepStatusType.ERROR,
    );

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

export default CreateProjectJobProgress;
