import {
    type AiAgentReviewBatchAction,
    type AiAgentReviewBatchExample,
    type AiAgentReviewBatchRunSummary,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Divider,
    Group,
    Progress,
    SegmentedControl,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine-8/core';
import { DatePickerInput } from '@mantine/dates';
import { IconPlaystationCircle } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import Callout from '../../../../../components/common/Callout';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useReviewBatchReport,
    useReviewBatchRun,
    useReviewBatchRuns,
    useStartReviewBatch,
} from '../../hooks/useAiAgentReviewBatch';
import {
    formatReviewDate,
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from './reviewItemDetails';

type WindowPreset = '7d' | '30d' | '90d' | 'custom';

type Props = {
    projectUuid: string | null;
    agentUuid: string | null;
};

const WINDOW_PRESETS: { value: WindowPreset; label: string }[] = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'custom', label: 'Custom' },
];

const computeWindow = (
    preset: WindowPreset,
    customRange: [Date | null, Date | null],
): { startedAt: Date; endedAt: Date } | null => {
    const now = new Date();
    if (preset === 'custom') {
        const [start, end] = customRange;
        if (!start || !end) return null;
        return { startedAt: start, endedAt: end };
    }
    const daysBack = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    const startedAt = new Date(now);
    startedAt.setDate(startedAt.getDate() - daysBack);
    return { startedAt, endedAt: now };
};

const humanize = (str: string): string =>
    str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const BatchActionsTable: FC<{ actions: AiAgentReviewBatchAction[] }> = ({
    actions,
}) => (
    <Table withTableBorder withColumnBorders>
        <Table.Thead>
            <Table.Tr>
                <Table.Th>Root cause</Table.Th>
                <Table.Th>Owner</Table.Th>
                <Table.Th>Fix target</Table.Th>
                <Table.Th>Count</Table.Th>
            </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
            {actions.map((action, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <Table.Tr key={idx}>
                    <Table.Td>
                        <CategoryBadge
                            variant="dot"
                            label={
                                reviewRootCauseLabels[action.primaryRootCause]
                            }
                            color={
                                reviewRootCauseColors[action.primaryRootCause]
                            }
                        />
                    </Table.Td>
                    <Table.Td>
                        <Text fz="sm">{humanize(action.ownerType)}</Text>
                    </Table.Td>
                    <Table.Td>
                        <Text fz="sm" c="dimmed">
                            {action.fixTarget
                                ? humanize(action.fixTarget)
                                : '—'}
                        </Text>
                    </Table.Td>
                    <Table.Td>
                        <Text fz="sm" fw={600}>
                            {action.count}
                        </Text>
                    </Table.Td>
                </Table.Tr>
            ))}
        </Table.Tbody>
    </Table>
);

const TopExamplesList: FC<{ examples: AiAgentReviewBatchExample[] }> = ({
    examples,
}) => (
    <Stack gap="xs">
        {examples.map((example) => (
            <Group key={example.promptUuid} gap="sm" wrap="nowrap">
                <CategoryBadge
                    variant="dot"
                    label={reviewRootCauseLabels[example.primaryRootCause]}
                    color={reviewRootCauseColors[example.primaryRootCause]}
                />
                <Text fz="sm" c="ldGray.8" lineClamp={1}>
                    {example.title}
                </Text>
            </Group>
        ))}
    </Stack>
);

const HistoryTable: FC<{
    runs: AiAgentReviewBatchRunSummary[];
    selectedRunUuid: string | undefined;
    onSelect: (runUuid: string) => void;
}> = ({ runs, selectedRunUuid, onSelect }) => (
    <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead>
            <Table.Tr>
                <Table.Th>Window</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Findings</Table.Th>
                <Table.Th>Run at</Table.Th>
            </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
            {runs.map((run) => (
                <Table.Tr
                    key={run.runUuid}
                    onClick={() => onSelect(run.runUuid)}
                    style={{ cursor: 'pointer' }}
                    bg={
                        run.runUuid === selectedRunUuid ? 'ldGray.0' : undefined
                    }
                >
                    <Table.Td>
                        <Text fz="sm">
                            {formatReviewDate(run.window.startedAt)} –{' '}
                            {formatReviewDate(run.window.endedAt)}
                        </Text>
                    </Table.Td>
                    <Table.Td>
                        <Badge
                            variant="light"
                            color={
                                run.status === 'completed'
                                    ? 'green'
                                    : run.status === 'failed'
                                      ? 'red'
                                      : 'blue'
                            }
                        >
                            {run.status}
                        </Badge>
                    </Table.Td>
                    <Table.Td>
                        <Text fz="sm">{run.findingCount}</Text>
                    </Table.Td>
                    <Table.Td>
                        <Text fz="sm" c="dimmed">
                            {formatReviewDate(run.createdAt)}
                        </Text>
                    </Table.Td>
                </Table.Tr>
            ))}
        </Table.Tbody>
    </Table>
);

export const BatchAnalysisPanel: FC<Props> = ({ projectUuid, agentUuid }) => {
    const [windowPreset, setWindowPreset] = useState<WindowPreset>('30d');
    const [customRange, setCustomRange] = useState<[Date | null, Date | null]>([
        null,
        null,
    ]);
    const [activeRunUuid, setActiveRunUuid] = useState<string | undefined>(
        undefined,
    );

    // TODO: project/agent scoping
    const startBatch = useStartReviewBatch();

    const { data: runs = [] } = useReviewBatchRuns({
        projectUuid: projectUuid ?? undefined,
        agentUuid: agentUuid ?? undefined,
    });

    const { data: run } = useReviewBatchRun(activeRunUuid, { poll: true });

    const { data: report } = useReviewBatchReport(activeRunUuid, {
        enabled: run?.status === 'completed',
    });

    const isInFlight =
        startBatch.isLoading ||
        run?.status === 'queued' ||
        run?.status === 'running';

    const windowDates = computeWindow(windowPreset, customRange);

    const handleRunAnalysis = async () => {
        if (!windowDates) return;
        const result = await startBatch.mutateAsync({
            projectUuid: null,
            agentUuid: null,
            startedAt: windowDates.startedAt,
            endedAt: windowDates.endedAt,
        });
        setActiveRunUuid(result.runUuid);
    };

    const progressValue =
        run && run.totalTurns > 0
            ? Math.round((run.processedTurns / run.totalTurns) * 100)
            : 0;

    return (
        <Stack gap="xl">
            <Stack gap="md">
                <Title order={5}>Run batch analysis</Title>
                <Text fz="sm" c="dimmed">
                    Analyse a time window of agent conversations without writing
                    anything to the live review queue.
                </Text>

                <Group gap="md" align="flex-end" wrap="wrap">
                    <Stack gap={4}>
                        <Text fz="xs" fw={500} c="ldGray.7">
                            Time window
                        </Text>
                        <SegmentedControl
                            value={windowPreset}
                            onChange={(v) => setWindowPreset(v as WindowPreset)}
                            data={WINDOW_PRESETS}
                            size="sm"
                        />
                    </Stack>

                    {windowPreset === 'custom' && (
                        <DatePickerInput
                            type="range"
                            label="Custom range"
                            value={customRange}
                            onChange={setCustomRange}
                            size="sm"
                            clearable
                        />
                    )}

                    <Button
                        onClick={() => void handleRunAnalysis()}
                        loading={isInFlight}
                        disabled={
                            isInFlight ||
                            (windowPreset === 'custom' &&
                                (!customRange[0] || !customRange[1]))
                        }
                        leftSection={
                            <MantineIcon icon={IconPlaystationCircle} />
                        }
                        size="sm"
                    >
                        Run analysis
                    </Button>
                </Group>
            </Stack>

            {run && (run.status === 'queued' || run.status === 'running') && (
                <Stack gap="xs">
                    <Progress value={progressValue} animated size="sm" />
                    <Text fz="sm" c="dimmed">
                        Reviewing {run.processedTurns} / {run.totalTurns} turns
                    </Text>
                </Stack>
            )}

            {run?.status === 'failed' && (
                <Callout variant="danger">
                    <Text fz="sm">
                        {run.errorMessage ??
                            'Analysis failed. Please try again.'}
                    </Text>
                </Callout>
            )}

            {report && run?.status === 'completed' && (
                <Stack gap="lg">
                    <Divider />
                    <Group gap="xs" wrap="wrap">
                        <Text fz="sm" fw={600} c="ldGray.9">
                            {report.turnsReviewed} turns reviewed
                        </Text>
                        <Text fz="sm" c="dimmed">
                            ·
                        </Text>
                        <Text fz="sm" fw={600} c="ldGray.9">
                            {report.flaggedTurns} flagged
                        </Text>
                        <Text fz="sm" c="dimmed">
                            ({Math.round(report.flaggedRate * 100)}%)
                        </Text>
                    </Group>

                    {report.actions.length > 0 && (
                        <Stack gap="sm">
                            <Title order={6}>Actions breakdown</Title>
                            <BatchActionsTable actions={report.actions} />
                        </Stack>
                    )}

                    {report.topExamples.length > 0 && (
                        <Stack gap="sm">
                            <Title order={6}>Top examples</Title>
                            <TopExamplesList examples={report.topExamples} />
                        </Stack>
                    )}
                </Stack>
            )}

            {runs.length > 0 && (
                <Stack gap="sm">
                    <Divider />
                    <Title order={5}>Past runs</Title>
                    <HistoryTable
                        runs={runs}
                        selectedRunUuid={activeRunUuid}
                        onSelect={setActiveRunUuid}
                    />
                </Stack>
            )}
        </Stack>
    );
};
