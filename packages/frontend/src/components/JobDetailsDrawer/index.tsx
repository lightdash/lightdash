import {
    JobStatusType,
    JobStepStatusType,
    type Job,
    type JobStep,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    CopyButton,
    Drawer,
    Group,
    Loader,
    Stack,
    Text,
    Title,
    useMantineTheme,
    type MantineTheme,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconAlertTriangleFilled,
    IconCheck,
    IconCircleCheckFilled,
    IconCopy,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import utc from 'dayjs/plugin/utc';
import { type FC } from 'react';
import {
    jobStatusLabel,
    jobStepStatusLabel,
    runningStepsInfo,
} from '../../hooks/useRefreshServer';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import MantineIcon from '../common/MantineIcon';
import ProjectCompileLog from './ProjectCompileLog';

dayjs.extend(duration);
dayjs.extend(utc);

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
        case 'SKIPPED':
            return {
                background: theme.colors.gray['1'],
                color: theme.colors.gray['6'],
                fontStyle: 'italic',
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
    return dayjs
        .utc(
            dayjs
                .duration(dayjs(endTime).diff(dayjs(startTime)))
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
    const isJobDone = activeJob.jobStatus === JobStatusType.DONE;

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
                        w="100%"
                        sx={{
                            borderRadius: 3,
                        }}
                    >
                        <Box pt={2}>
                            <StepIcon step={step} />
                        </Box>
                        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                            <Text fw={600}>{step.stepLabel}</Text>

                            <Text fz="xs">
                                <Text
                                    span
                                    fw={600}
                                    c={statusInfo(step.stepStatus, theme).color}
                                    fs={
                                        statusInfo(step.stepStatus, theme)
                                            .fontStyle || 'normal'
                                    }
                                >
                                    {jobStepStatusLabel(step.stepStatus)}{' '}
                                </Text>
                                {jobStepDuration(step)}
                            </Text>
                            {step.stepError && (
                                <Stack
                                    mt="xs"
                                    pt="xs"
                                    sx={{
                                        backgroundColor: theme.colors.red[0],
                                        border: `1px solid ${theme.colors.red[2]}`,
                                        borderRadius: theme.radius.sm,
                                        padding: theme.spacing.xs,
                                        width: '100%',
                                        flexShrink: 0,
                                    }}
                                    pos="relative"
                                    spacing="xs"
                                >
                                    <CopyButton
                                        value={
                                            step.stepError +
                                                step.stepDbtLogs
                                                    ?.filter(
                                                        (log) =>
                                                            log.info.level ===
                                                            'error',
                                                    )
                                                    .map((log) => log.info.msg)
                                                    .join('\n') || ''
                                        }
                                    >
                                        {({ copied, copy }) => (
                                            <ActionIcon
                                                onClick={copy}
                                                pos="absolute"
                                                top={6}
                                                right={4}
                                                size="xs"
                                            >
                                                {copied ? (
                                                    <MantineIcon
                                                        icon={IconCheck}
                                                    />
                                                ) : (
                                                    <MantineIcon
                                                        icon={IconCopy}
                                                    />
                                                )}
                                            </ActionIcon>
                                        )}
                                    </CopyButton>
                                    <Stack
                                        spacing="xs"
                                        sx={{
                                            maxHeight: '200px',
                                            overflow: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            minWidth: '100%',
                                            flexGrow: 1,
                                        }}
                                    >
                                        <Text
                                            size="xs"
                                            color="red"
                                            sx={{
                                                width: '100%',
                                                wordBreak: 'normal',
                                                overflowWrap: 'break-word',
                                            }}
                                        >
                                            {step.stepError}
                                        </Text>
                                        {step.stepDbtLogs
                                            ?.filter(
                                                (log) =>
                                                    log.info.level === 'error',
                                            )
                                            .map((log) => (
                                                <Text
                                                    key={log.info.ts}
                                                    size="xs"
                                                    pt="xs"
                                                    sx={{
                                                        borderTop: `1px solid ${theme.colors.red[2]}`,
                                                        overflowWrap:
                                                            'break-word',
                                                    }}
                                                >
                                                    {log.info.msg}
                                                </Text>
                                            ))}
                                    </Stack>
                                </Stack>
                            )}
                        </Stack>
                    </Group>
                ))}
                {isJobDone && activeJob.projectUuid && (
                    <ProjectCompileLog
                        projectUuid={activeJob.projectUuid}
                        jobUuid={activeJob.jobUuid}
                    />
                )}
            </Stack>
        </Drawer>
    );
};

export default JobDetailsDrawer;
