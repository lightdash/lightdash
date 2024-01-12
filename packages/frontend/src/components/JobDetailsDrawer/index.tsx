import {
    Job,
    JobStatusType,
    JobStep,
    JobStepStatusType,
} from '@lightdash/common';
import {
    Box,
    Drawer,
    Group,
    Loader,
    MantineTheme,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
} from '@tabler/icons-react';
import moment from 'moment';
import { FC } from 'react';
import {
    jobStatusLabel,
    jobStepStatusLabel,
    runningStepsInfo,
} from '../../hooks/useRefreshServer';
import { useActiveJob } from '../../providers/ActiveJobProvider';
import MantineIcon from '../common/MantineIcon';

const statusInfo = (status: string, theme: MantineTheme) => {
    switch (status) {
        case 'DONE':
            return {
                background: theme.colors.green['1'],
                color: theme.colors.green['9'],
            };
        case 'ERROR':
            return {
                background: theme.colors.red['1'],
                color: theme.colors.red['9'],
            };
        default:
            return {
                background: theme.colors.gray['1'],
                color: theme.colors.gray['9'],
            };
    }
};

const durationSince = (
    startTime: Date,
    endTime: Date | undefined = undefined,
) => {
    return moment
        .utc(
            moment
                .duration(moment(endTime).diff(moment(startTime)))
                .asMilliseconds(),
        )
        .format('HH:mm:ss');
};

const jobStepDuration = (jobStep: JobStep): string | null => {
    switch (jobStep.stepStatus) {
        case JobStepStatusType.ERROR:
        case JobStepStatusType.DONE:
            return durationSince(
                jobStep.startedAt || jobStep.updatedAt,
                jobStep.updatedAt,
            );
        case JobStepStatusType.RUNNING:
            return durationSince(jobStep.startedAt || jobStep.updatedAt);
        default:
            return null;
    }
};

type DrawerIconProps = { job: Job };
const DrawerIcon: FC<DrawerIconProps> = ({ job }) => {
    switch (job.jobStatus) {
        case JobStatusType.ERROR:
            return <MantineIcon icon={IconAlertTriangle} size="xl" />;
        case JobStatusType.DONE:
            return <MantineIcon icon={IconCircleCheckFilled} size="xl" />;
        case JobStatusType.RUNNING:
            return <Loader color="dark" size="sm" />;
        case JobStatusType.STARTED:
            return null;
        default:
            throw new Error('Unknown job status');
    }
};

type StepIconProps = { step: JobStep };
const StepIcon: FC<StepIconProps> = ({ step }) => {
    const theme = useMantineTheme();

    switch (step.stepStatus) {
        case JobStepStatusType.ERROR:
            return (
                <MantineIcon
                    icon={IconAlertTriangleFilled}
                    style={{
                        color: statusInfo(step.stepStatus, theme).color,
                    }}
                />
            );
        case JobStepStatusType.DONE:
            return (
                <MantineIcon
                    icon={IconCircleCheckFilled}
                    style={{
                        color: statusInfo(step.stepStatus, theme).color,
                    }}
                />
            );
        case JobStepStatusType.RUNNING:
            return <Loader color="dark" size={16} />;
        case JobStepStatusType.SKIPPED:
        case JobStepStatusType.PENDING:
            return null;
        default:
            throw new Error('Unknown job step status');
    }
};

const JobDetailsDrawer: FC = () => {
    const theme = useMantineTheme();
    const { isJobsDrawerOpen, setIsJobsDrawerOpen, activeJob } = useActiveJob();

    if (!activeJob) {
        return null;
    }

    const hasSteps = !!activeJob?.steps.length;
    return (
        <Drawer
            trapFocus
            closeOnEscape
            closeOnClickOutside
            withOverlay
            withCloseButton
            position="right"
            opened={isJobsDrawerOpen}
            onClose={() => setIsJobsDrawerOpen(false)}
            title={
                <Group noWrap align="center" spacing="xs">
                    <DrawerIcon job={activeJob} />

                    <Box>
                        <Title order={4} fw={600}>
                            {jobStatusLabel(activeJob.jobStatus)}
                        </Title>
                        {hasSteps && (
                            <Text c="gray.6" fz="sm" fw={500}>{`${
                                runningStepsInfo(activeJob.steps)
                                    .completedStepsMessage
                            } steps complete - ${durationSince(
                                activeJob.createdAt,
                            )}`}</Text>
                        )}
                    </Box>
                </Group>
            }
        >
            <Stack p="sm">
                {activeJob.steps?.map((step) => (
                    <Group
                        key={step.jobUuid}
                        align="flex-start"
                        bg={statusInfo(step.stepStatus, theme).background}
                        p="sm"
                        spacing="xs"
                        sx={{
                            borderRadius: 3,
                        }}
                    >
                        <Box pt={2}>
                            <StepIcon step={step} />
                        </Box>
                        <Stack spacing={1}>
                            <Text fw={600}>{step.stepLabel}</Text>

                            <Text fz="xs">
                                <Text
                                    span
                                    fw={600}
                                    c={statusInfo(step.stepStatus, theme).color}
                                >
                                    {jobStepStatusLabel(step.stepStatus)}{' '}
                                </Text>
                                {jobStepDuration(step)}
                            </Text>
                            {step.stepError && (
                                <Box
                                    mt="xs"
                                    sx={{
                                        wordWrap: 'break-word',
                                        hyphens: 'auto',
                                    }}
                                >
                                    <Text>{step.stepError}</Text>
                                    {step.stepDbtLogs
                                        ?.filter(
                                            (log) => log.info.level === 'error',
                                        )
                                        .map((log) => (
                                            <Text key={log.info.ts}>
                                                {log.info.msg
                                                    .split('\n')
                                                    .map((line) => (
                                                        <>
                                                            {line}
                                                            <br />
                                                        </>
                                                    ))}
                                            </Text>
                                        ))}
                                </Box>
                            )}
                        </Stack>
                    </Group>
                ))}
            </Stack>
        </Drawer>
    );
};

export default JobDetailsDrawer;
