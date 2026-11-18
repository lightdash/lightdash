import {
    type ModelMaterializationSample,
    type ModelMaterializationStatus,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useContext, type FC } from 'react';
import { useSearchParams } from 'react-router';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { formatFileSize } from '../../utils/formatters';
import {
    DRAFT_PARAM,
    DRAFT_REVIEW,
    hasDraftMaterialization,
} from './modelCode';
import { StudioSampleTable } from './PreAggregateInsights';
import {
    ModelMaterializationContext,
    useModelMaterialization,
} from './useModelMaterialization';
import { useSemanticLayerDraft } from './useSemanticLayerModel';

export const MaterializedBadge: FC<{ model: string }> = ({ model }) => {
    const { models } = useContext(ModelMaterializationContext);
    return models.has(model) ? (
        <Badge size="sm" tt="none" variant="light">
            Materialized
        </Badge>
    ) : null;
};

const formatUtc = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});
const utc = (date: string) => `${formatUtc.format(new Date(date))} UTC`;

const sourceLabel = (status: ModelMaterializationStatus) => {
    if (status.servingCopy && status.asOf)
        return `Materialized · as of ${utc(status.asOf)}`;
    if (status.state === 'preparing') return 'Preparing · serving live';
    if (status.state === 'blocked') return 'Blocked';
    return 'Live';
};

const ModelSourceCard: FC<{
    status: ModelMaterializationStatus;
    sample: ModelMaterializationSample | null;
    sampleFailed: boolean;
    actionError: string | null;
    busy: boolean;
    queued: boolean;
    drafted: boolean;
    asPullRequest: boolean;
    onDraft: () => void;
    onReview: () => void;
    onRefresh: () => void;
}> = ({
    status,
    sample,
    sampleFailed,
    actionError,
    busy,
    queued,
    drafted,
    asPullRequest,
    onDraft,
    onReview,
    onRefresh,
}) => (
    <Paper p="md">
        <Stack gap="md">
            <Group justify="space-between" align="flex-start" gap="sm">
                <Box>
                    <Title order={5}>Model source</Title>
                    <Text size="sm" mt={4} aria-live="polite">
                        {sourceLabel(status)}
                    </Text>
                </Box>
                {status.state === 'live' ? (
                    <Button
                        variant="default"
                        size="xs"
                        loading={busy}
                        onClick={drafted ? onReview : onDraft}
                    >
                        {drafted ? 'Review draft' : 'Materialize this model'}
                    </Button>
                ) : (
                    <Button
                        variant="default"
                        size="xs"
                        loading={busy}
                        disabled={queued || status.state === 'preparing'}
                        onClick={onRefresh}
                    >
                        Refresh now
                    </Button>
                )}
            </Group>
            {status.state === 'live' ? (
                <Text fz="sm" c="dimmed">
                    {drafted
                        ? asPullRequest
                            ? 'Materialization is in your draft. The first copy builds after the pull request is merged and deployed.'
                            : 'Materialization is in your draft. Publish the change to build the first copy.'
                        : 'Store a copy so charts can query this model without reading the warehouse.'}
                </Text>
            ) : null}
            {queued && status.state !== 'preparing' ? (
                <Text size="sm" c="dimmed" role="status">
                    Refresh requested
                </Text>
            ) : null}
            {status.state === 'preparing' && status.servingCopy ? (
                <Text size="sm" c="dimmed" role="status">
                    Refreshing the copy
                </Text>
            ) : null}
            {status.servingCopy ? (
                <Group gap="xl">
                    {status.rowCount !== null ? (
                        <Fact
                            label="Rows"
                            value={status.rowCount.toLocaleString()}
                        />
                    ) : null}
                    {status.maxRows !== null ? (
                        <Fact
                            label="Row limit"
                            value={status.maxRows.toLocaleString()}
                        />
                    ) : null}
                    {status.byteCount !== null ? (
                        <Fact
                            label="Size"
                            value={formatFileSize(status.byteCount)}
                        />
                    ) : null}
                    <Fact
                        label={status.nextRefresh ? 'Next refresh' : 'Refresh'}
                        value={
                            status.nextRefresh
                                ? utc(status.nextRefresh)
                                : 'Manual'
                        }
                    />
                </Group>
            ) : null}
            {status.failureReason ? (
                <Callout
                    variant="warning"
                    title={
                        status.state === 'blocked'
                            ? 'Materialization blocked'
                            : 'Last build failed'
                    }
                >
                    {status.failureReason}
                </Callout>
            ) : null}
            {actionError ? (
                <Callout variant="danger">{actionError}</Callout>
            ) : null}
            {status.servingCopy &&
                (sampleFailed ? (
                    <Text size="sm" c="dimmed">
                        The sample could not be loaded.
                    </Text>
                ) : sample === null ? (
                    <Text size="sm" c="dimmed">
                        Loading sample…
                    </Text>
                ) : sample.rows.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        The copy contains no rows.
                    </Text>
                ) : (
                    <StudioSampleTable
                        caption="Sample from the materialized copy"
                        columns={sample.columns.map((id) => ({
                            id,
                            label: id,
                            numeric: sample.rows.some(
                                (r) => typeof r[id] === 'number',
                            ),
                        }))}
                        rows={sample.rows.map((r) =>
                            sample.columns.map((column) =>
                                r[column] === null ? 'null' : String(r[column]),
                            ),
                        )}
                        loading={false}
                    />
                ))}
        </Stack>
    </Paper>
);

const Fact: FC<{ label: string; value: string }> = ({ label, value }) => (
    <Box>
        <Text size="xs" c="dimmed">
            {label}
        </Text>
        <Text size="sm">{value}</Text>
    </Box>
);

export const ModelSource: FC<{
    projectUuid: string;
    model: string;
    asPullRequest: boolean;
}> = ({ projectUuid, model, asPullRequest }) => {
    const { status, sample, change, queued } = useModelMaterialization(
        projectUuid,
        model,
    );
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const [, setSearch] = useSearchParams();
    const onReview = () => setSearch({ [DRAFT_PARAM]: DRAFT_REVIEW });
    if (status.isError)
        return (
            <InlineErrorState
                message="Model source could not be loaded."
                onRetry={() => void status.refetch()}
            />
        );
    if (!status.data) return <EmptyStateLoader />;
    return (
        <ModelSourceCard
            status={status.data}
            sample={sample.data ?? null}
            sampleFailed={sample.isError}
            busy={change.isLoading}
            queued={queued}
            actionError={change.error?.error.message ?? null}
            asPullRequest={asPullRequest}
            drafted={
                draft?.models.some(
                    (m) =>
                        m.model === model &&
                        hasDraftMaterialization(m.contentAfter),
                ) ?? false
            }
            onDraft={() => change.mutate('draft', { onSuccess: onReview })}
            onReview={onReview}
            onRefresh={() => change.mutate('refresh')}
        />
    );
};
