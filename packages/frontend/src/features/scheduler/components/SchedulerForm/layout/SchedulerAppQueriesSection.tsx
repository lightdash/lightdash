import {
    assertUnreachable,
    MAX_DELIVERY_QUERIES,
    type DeliveryCaptureManifest,
    type SchedulerAppState,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Checkbox,
    Group,
    Loader,
    Stack,
    Text,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import AppDeliveryPreviewCapture from '../../../../apps/deliveryCapture/AppDeliveryPreviewCapture';
import {
    buildAppQueryPickerRows,
    hasExcludedQuerySelections,
    toAppQuerySelections,
    type AppQueryPickerRow,
} from '../../../utils/appQuerySelections';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerAppQueriesSection.module.css';
import modalClasses from './SchedulerDeliveryModal.module.css';

type CaptureState =
    | { status: 'idle' }
    | { status: 'loading'; runId: number }
    | { status: 'ready'; manifest: DeliveryCaptureManifest }
    | { status: 'failed' };

type Props = {
    appUuid: string;
    /** State the "Send current app state" toggle would attach — forced on by
     *  the first exclusion so the delivery reproduces the curated view. */
    availableAppState: SchedulerAppState | null;
};

const RowBadges: FC<{ row: AppQueryPickerRow }> = ({ row }) => {
    switch (row.kind) {
        case 'ready':
            return (
                <>
                    {row.rowCount !== null && (
                        <Text size="xs" c="dimmed" flex="0 0 auto">
                            ~{row.rowCount} rows
                        </Text>
                    )}
                    {row.limitReached && (
                        <Badge size="xs" variant="light" color="yellow">
                            limit reached
                        </Badge>
                    )}
                </>
            );
        case 'error':
            return (
                <Badge size="xs" variant="light" color="red">
                    error
                </Badge>
            );
        case 'missing':
            return (
                <Badge size="xs" variant="light" color="gray">
                    didn't run in preview
                </Badge>
            );
        default:
            return assertUnreachable(row, 'Unknown picker row kind');
    }
};

/**
 * "Queries" sub-block of an app delivery: boots a hidden preview render on
 * first expand, lists the captured queries, and persists a full selection
 * snapshot into the form once the user curates. On render failure/timeout it
 * falls back to "no curation" — every query is delivered.
 */
export const SchedulerAppQueriesSection: FC<Props> = ({
    appUuid,
    availableAppState,
}) => {
    const form = useSchedulerFormContext();
    const projectUuid = useProjectUuid();
    const [expanded, setExpanded] = useState(false);
    const [capture, setCapture] = useState<CaptureState>({ status: 'idle' });
    const runIdRef = useRef(0);

    const selections = form.values.appQuerySelections;
    // The state the scheduler will save if the user curates — the render must
    // run under it so captureKeys match the scheduled delivery's.
    const renderAppState = form.values.appState ?? availableAppState;
    const canCurate = renderAppState !== null;

    const startCapture = useCallback(() => {
        runIdRef.current += 1;
        setCapture({ status: 'loading', runId: runIdRef.current });
    }, []);

    const handleToggleExpanded = () => {
        const next = !expanded;
        setExpanded(next);
        // Lazy start on first expand; a failed render re-runs on re-expand.
        if (
            next &&
            (capture.status === 'idle' || capture.status === 'failed')
        ) {
            startCapture();
        }
    };

    const handleManifest = useCallback(
        (manifest: DeliveryCaptureManifest) =>
            setCapture({ status: 'ready', manifest }),
        [],
    );
    const handleCaptureError = useCallback(
        () => setCapture({ status: 'failed' }),
        [],
    );

    const rows = useMemo(
        () =>
            capture.status === 'ready'
                ? buildAppQueryPickerRows(capture.manifest, selections)
                : null,
        [capture, selections],
    );

    const handleToggleRow = (captureKey: string) => {
        if (rows === null) return;
        const nextRows = rows.map((row) =>
            row.captureKey === captureKey
                ? { ...row, excluded: !row.excluded }
                : row,
        );
        const nextSelections = toAppQuerySelections(nextRows);
        form.setFieldValue('appQuerySelections', nextSelections);
        // Curation implies state: the first exclusion pins the app state so
        // the delivery reproduces the exact view the keys were captured from.
        if (
            hasExcludedQuerySelections(nextSelections) &&
            form.values.appState == null &&
            availableAppState !== null
        ) {
            form.setFieldValue('appState', availableAppState);
        }
    };

    const excludedCount = selections?.filter((s) => s.excluded).length ?? 0;
    const allExcluded =
        rows !== null && rows.length > 0 && rows.every((row) => row.excluded);
    const overflowCount =
        capture.status === 'ready' ? capture.manifest.overflowCount : 0;
    const hasIndicativeCounts =
        rows?.some((row) => row.kind === 'ready' && row.rowCount !== null) ??
        false;

    return (
        <Stack gap="xs">
            <span className={modalClasses.subBlockLabel}>Queries</span>
            <Text size="xs" c="ldGray.6">
                Each data query the app runs becomes a file in this delivery.
            </Text>
            {!expanded && excludedCount > 0 && selections !== null && (
                <Text size="xs" c="ldGray.6">
                    {excludedCount} of {selections.length}{' '}
                    {selections.length === 1 ? 'query' : 'queries'} excluded
                </Text>
            )}
            <Button
                type="button"
                variant="default"
                size="xs"
                w="fit-content"
                leftSection={
                    <MantineIcon
                        icon={expanded ? IconChevronDown : IconChevronRight}
                        size={14}
                    />
                }
                onClick={handleToggleExpanded}
            >
                Choose queries
            </Button>

            {expanded && capture.status === 'loading' && (
                <Group gap="xs">
                    <Loader size="xs" />
                    <Text size="xs" c="dimmed">
                        Running the app to detect its data queries…
                    </Text>
                </Group>
            )}

            {expanded && capture.status === 'failed' && (
                <Callout
                    variant="warning"
                    title="Couldn't detect this app's queries"
                >
                    <Stack gap="xs" align="flex-start">
                        <Text size="xs">
                            You can still save this delivery — every query the
                            app runs will be included.
                        </Text>
                        <Button
                            type="button"
                            variant="default"
                            size="compact-xs"
                            onClick={startCapture}
                        >
                            Try again
                        </Button>
                    </Stack>
                </Callout>
            )}

            {expanded && rows !== null && (
                <>
                    {!canCurate && rows.length > 0 && (
                        <Callout variant="info">
                            Choosing queries requires sending app state with the
                            delivery, and this app has no state to send.
                        </Callout>
                    )}
                    {rows.length === 0 ? (
                        <Text size="xs" c="dimmed">
                            This app ran no data queries in the preview.
                        </Text>
                    ) : (
                        <Box className={classes.rowsContainer}>
                            {rows.map((row) => (
                                <Box
                                    key={row.captureKey}
                                    className={classes.row}
                                >
                                    <Checkbox
                                        size="xs"
                                        checked={!row.excluded}
                                        disabled={!canCurate}
                                        onChange={() =>
                                            handleToggleRow(row.captureKey)
                                        }
                                        label={
                                            <Group gap="xs" wrap="nowrap">
                                                <Text
                                                    size="xs"
                                                    fw={500}
                                                    truncate="end"
                                                >
                                                    {row.label}
                                                </Text>
                                                <RowBadges row={row} />
                                            </Group>
                                        }
                                    />
                                    {row.kind === 'error' && (
                                        <Text
                                            size="xs"
                                            c="red"
                                            className={classes.rowDetail}
                                        >
                                            {row.error}
                                        </Text>
                                    )}
                                    {row.kind === 'missing' && (
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            className={classes.rowDetail}
                                        >
                                            Saved with this delivery but didn't
                                            run in this preview. If it doesn't
                                            run at delivery time it's reported
                                            as missing.
                                        </Text>
                                    )}
                                    {row.kind !== 'missing' &&
                                        row.identityChanged && (
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                className={classes.rowDetail}
                                            >
                                                This query changed since the
                                                delivery was last saved — its
                                                previous selection no longer
                                                applies.
                                            </Text>
                                        )}
                                </Box>
                            ))}
                        </Box>
                    )}
                    {hasIndicativeCounts && (
                        <Text size="xs" c="dimmed">
                            Row counts come from this preview and may differ at
                            delivery time.
                        </Text>
                    )}
                    {overflowCount > 0 && (
                        <Callout variant="info">
                            {overflowCount} more{' '}
                            {overflowCount === 1 ? 'query' : 'queries'} ran past
                            the {MAX_DELIVERY_QUERIES}-query capture limit and
                            can't be selected here.
                        </Callout>
                    )}
                    {allExcluded && (
                        <Callout variant="danger">
                            Every query is excluded, so this delivery would be
                            empty. Include at least one query.
                        </Callout>
                    )}
                </>
            )}

            {capture.status === 'loading' && projectUuid && (
                <AppDeliveryPreviewCapture
                    key={capture.runId}
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    appState={renderAppState}
                    onManifest={handleManifest}
                    onError={handleCaptureError}
                />
            )}
        </Stack>
    );
};
