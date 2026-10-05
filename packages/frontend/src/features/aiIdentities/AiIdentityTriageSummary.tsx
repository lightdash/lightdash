import {
    AiIdentityFailureReason,
    AiIdentityFailureSeverity,
    AiIdentityJobStatus,
    AiIdentityState,
    type AiIdentityAccount,
    type AiIdentityFilter,
    type AiIdentityFailureGroup,
    type AiIdentityListResult,
    type AiIdentityJob,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Paper,
    Progress,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { type FC } from 'react';
import Callout from '../../components/common/Callout';
import classes from './AiIdentitiesPage.module.css';

dayjs.extend(relativeTime);

const stateLabels: Record<AiIdentityState, string> = {
    [AiIdentityState.READY]: 'Ready',
    [AiIdentityState.PENDING]: 'Pending',
    [AiIdentityState.FAILED]: 'Failed',
    [AiIdentityState.NEEDS_SIGN_IN]: 'Needs sign-in',
};

const stateColors: Record<AiIdentityState, string | undefined> = {
    [AiIdentityState.READY]: 'green.7',
    [AiIdentityState.PENDING]: undefined,
    [AiIdentityState.FAILED]: 'red.7',
    [AiIdentityState.NEEDS_SIGN_IN]: 'orange.7',
};

const LastFullCheck: FC<{ value: Date | string | null }> = ({ value }) =>
    value ? (
        <Tooltip label={new Date(value).toLocaleString()}>
            <Text fz="xs" c="dimmed">
                Last full check {dayjs(value).fromNow()}
            </Text>
        </Tooltip>
    ) : (
        <Text fz="xs" c="dimmed">
            No full check yet
        </Text>
    );

type Props = {
    account: AiIdentityAccount;
    filter: AiIdentityFilter;
    result: AiIdentityListResult | undefined;
    job: AiIdentityJob | undefined;
    onMultiParam: (key: string, values: string[]) => void;
    onJob: (
        kind: 'test' | 'export',
        filter: AiIdentityFilter,
        format?: 'json' | 'sql' | 'csv',
    ) => Promise<void>;
};

export const AiIdentityTriageSummary: FC<Props> = ({
    account,
    filter,
    result,
    job,
    onMultiParam,
    onJob,
}) => {
    const failedFilter: AiIdentityFilter = {
        ...filter,
        states: [AiIdentityState.FAILED],
        reasons: [],
        projectUuid: null,
        search: null,
        staleOnly: false,
        aiIdentityUuids: null,
    };
    const activeReasons = new Set(filter.reasons);
    const changeMultiParam = onMultiParam;
    return (
        <>
            <Paper p="md">
                <Stack gap="sm">
                    <Group gap={0} wrap="wrap" className={classes.statRow}>
                        <UnstyledButton
                            className={classes.statTile}
                            data-active={
                                filter.states.length === 0 || undefined
                            }
                            onClick={() => changeMultiParam('state', [])}
                        >
                            <Text className={classes.statNumber}>
                                {account.counts.total.toLocaleString()}
                            </Text>
                            <Text fz="sm" c="dimmed">
                                People
                            </Text>
                        </UnstyledButton>
                        {Object.values(AiIdentityState).map((state) => {
                            const count = account.counts[state];
                            const color =
                                count > 0 ? stateColors[state] : undefined;
                            return (
                                <UnstyledButton
                                    key={state}
                                    className={classes.statTile}
                                    data-active={
                                        (filter.states.length === 1 &&
                                            filter.states[0] === state) ||
                                        undefined
                                    }
                                    aria-label={`Show ${stateLabels[state].toLowerCase()}: ${count}`}
                                    onClick={() =>
                                        changeMultiParam('state', [state])
                                    }
                                >
                                    <Text
                                        className={classes.statNumber}
                                        c={color}
                                    >
                                        {count.toLocaleString()}
                                    </Text>
                                    <Text fz="sm" c="dimmed">
                                        {stateLabels[state]}
                                    </Text>
                                </UnstyledButton>
                            );
                        })}
                    </Group>
                    {job &&
                        job.kind === 'test' &&
                        job.status !== AiIdentityJobStatus.DONE &&
                        job.status !== AiIdentityJobStatus.FAILED && (
                            <Stack gap="xs">
                                <Text fz="xs">
                                    Checking {job.done} of {job.total}… Checks
                                    run 20 at a time.
                                </Text>
                                <Progress
                                    value={
                                        (job.done / Math.max(job.total, 1)) *
                                        100
                                    }
                                />
                            </Stack>
                        )}
                    <Group justify="space-between">
                        <LastFullCheck value={account.lastFullCheckAt} />
                        {account.counts.failed > 0 && (
                            <Button
                                size="xs"
                                onClick={() => void onJob('test', failedFilter)}
                            >
                                Re-test all failed ({account.counts.failed})
                            </Button>
                        )}
                    </Group>
                </Stack>
            </Paper>
            {account.counts.total > 0 &&
                account.counts.ready === account.counts.total && (
                    <Callout variant="success">
                        All {account.counts.total.toLocaleString()} AI
                        identities are ready.
                    </Callout>
                )}
            {!!result?.failureGroups.length && (
                <Stack gap="xs">
                    <Text fw={600} fz="sm">
                        {account.counts.failed === 1
                            ? '1 failure'
                            : `${account.counts.failed} failures`}
                        , grouped by cause
                    </Text>
                    <ScrollArea scrollbars="x">
                        <Group wrap="nowrap" gap="sm">
                            {result.failureGroups.map(
                                (group: AiIdentityFailureGroup) => (
                                    <Paper
                                        key={group.reason}
                                        p="sm"
                                        className={`${classes.groupCard} ${activeReasons.has(group.reason) ? classes.groupCardActive : ''}`}
                                    >
                                        <Stack gap="xs">
                                            <Button
                                                variant="subtle"
                                                size="xs"
                                                onClick={() =>
                                                    changeMultiParam('reason', [
                                                        group.reason,
                                                    ])
                                                }
                                            >
                                                <Badge
                                                    color={
                                                        group.severity ===
                                                        AiIdentityFailureSeverity.SECURITY
                                                            ? 'red'
                                                            : 'orange'
                                                    }
                                                    mr="xs"
                                                >
                                                    {group.count}
                                                </Badge>
                                                {group.title}
                                            </Button>
                                            <Text fz="xs" c="dimmed">
                                                {group.explanation}
                                            </Text>
                                            <Button
                                                variant="default"
                                                size="xs"
                                                onClick={() =>
                                                    void onJob(
                                                        group.reason ===
                                                            AiIdentityFailureReason.KEY_OR_USER_REJECTED
                                                            ? 'export'
                                                            : 'test',
                                                        {
                                                            ...filter,
                                                            states: [
                                                                AiIdentityState.FAILED,
                                                            ],
                                                            reasons: [
                                                                group.reason,
                                                            ],
                                                        },
                                                        group.reason ===
                                                            AiIdentityFailureReason.KEY_OR_USER_REJECTED
                                                            ? 'sql'
                                                            : undefined,
                                                    )
                                                }
                                            >
                                                {group.reason ===
                                                AiIdentityFailureReason.KEY_OR_USER_REJECTED
                                                    ? 'Export fix SQL'
                                                    : 'Re-test group'}
                                            </Button>
                                        </Stack>
                                    </Paper>
                                ),
                            )}
                        </Group>
                    </ScrollArea>
                </Stack>
            )}
        </>
    );
};
