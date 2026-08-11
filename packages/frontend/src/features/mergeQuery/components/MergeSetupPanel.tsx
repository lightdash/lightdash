import { FeatureFlags, getItemId, MergeJoinType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Collapse,
    Group,
    MultiSelect,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconInfoCircle,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../../explorer/store';
import { EMPTY_MERGE, MAX_PIVOT_VALUES } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import styles from './MergeSetupPanel.module.css';

/**
 * One query, as something you focus rather than a card with a badge in it.
 *
 * The accent arrives on the whole token when it is the one being edited. A
 * rail down one edge said the same thing in a way that fought every other
 * bordered thing on the page.
 */
const QueryToken: FC<{
    accent: string;
    tint: string;
    name: string;
    meta: string;
    isActive: boolean;
    onFocus: () => void;
    onHover: (hovering: boolean) => void;
}> = ({ accent, tint, name, meta, isActive, onFocus, onHover }) => (
    <UnstyledButton
        className={styles.query}
        data-active={isActive}
        onClick={onFocus}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        style={{
            '--merge-accent': accent,
            '--merge-tint': tint,
        }}
    >
        <span className={styles.dot} />
        <span>
            <Text className={styles.queryName} truncate>
                {name}
            </Text>
            <Text className={styles.queryMeta} truncate>
                {meta}
            </Text>
        </span>
    </UnstyledButton>
);

/** Guidance as a line of text. A coloured box for every hint is a lot to read. */
const Note: FC<{ tone: 'muted' | 'warn'; children: React.ReactNode }> = ({
    tone,
    children,
}) => (
    <div className={styles.note}>
        <MantineIcon
            className={styles.noteIcon}
            icon={tone === 'warn' ? IconAlertTriangle : IconInfoCircle}
            color={tone === 'warn' ? 'orange.7' : 'gray.6'}
        />
        <Text size="xs" c={tone === 'warn' ? undefined : 'dimmed'}>
            {children}
        </Text>
    </div>
);

/**
 * Merging changes what the query is, so this sits above the controls that
 * narrow it rather than beside the results it produces.
 */
export const MergeSetupPanel: FC = () => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const mergeContext = useMergeSafe();
    const {
        isMerging,
        wasRestored,
        focus,
        queryB,
        joinType,
        postPivotIndex,
        removeQuery,
        setFocus,
        setJoinField,
        addJoinPart,
        removeJoinPart,
        setJoinType,
        setPivotValues,
    } = mergeContext ?? EMPTY_MERGE;
    const { isRunning, runErrors, mergeResults } = mergeContext ?? {};

    const {
        effectiveParts,
        labelFor,
        repairs,
        unrepairable,
        joinKeyErrors,
        joinFieldLabel,
        joinItemsA,
        joinItemsB,
        exploreALabel,
        exploreBLabel,
        isIncomplete,
        blockingReason,
        canRun,
        handleRun,
    } = useMergeSetup();

    const [highlight, setHighlight] = useState<'a' | 'b' | null>(null);

    // Named for what survives, and explained in the terms of this merge: which
    // key, and which tables. "Full outer" is the mechanism, not the meaning.
    const thisQuery = exploreALabel || 'this query';
    const otherQuery = exploreBLabel || 'the other query';
    const keepOptions = [
        {
            value: MergeJoinType.FULL,
            label: 'Everything',
            help: `Every ${joinFieldLabel} from either query. Where one side has no match, its columns are blank.`,
        },
        {
            value: MergeJoinType.LEFT,
            label: thisQuery,
            help: `Only the ${joinFieldLabel} values in ${thisQuery}. Anything found solely in ${otherQuery} is dropped.`,
        },
        {
            value: MergeJoinType.INNER,
            label: 'Matches',
            help: `Only the ${joinFieldLabel} values in both ${thisQuery} and ${otherQuery}. Everything unmatched is dropped.`,
        },
    ];
    const activeKeep =
        keepOptions.find((option) => option.value === joinType) ??
        keepOptions[0];
    const mergeError = mergeResults?.results.error ?? null;

    // A merge that arrived with the chart has to run itself. Without this a
    // saved merged chart opens showing Query A's results — the wrong numbers,
    // presented as the chart that was saved.
    const hasAutoRun = useRef(false);
    useEffect(() => {
        if (!wasRestored || hasAutoRun.current || isRunning) return;
        if (!canRun || mergeResults) return;
        hasAutoRun.current = true;
        handleRun();
    }, [wasRestored, canRun, isRunning, mergeResults, handleRun]);

    if (!mergeContext || !tableName || mergeFlag?.enabled !== true) return null;
    if (!isMerging) return null;

    return (
        <Paper withBorder radius="md" p="md" className={styles.panel}>
            <Stack gap="sm">
                <Group gap="xs">
                    <Text className={styles.title}>Merge</Text>
                    <Text size="xs" c="dimmed">
                        one row per join key, from two queries
                    </Text>
                    <Tooltip label="Remove the second query" withinPortal>
                        <ActionIcon
                            className={styles.spacer}
                            variant="subtle"
                            size="sm"
                            onClick={removeQuery}
                            aria-label="Remove the second query"
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <div className={styles.relation} data-highlight={highlight}>
                    <QueryToken
                        accent="var(--mantine-color-blue-5)"
                        tint="var(--mantine-color-blue-light)"
                        name={exploreALabel}
                        meta={`${metricQuery.metrics.length} metrics · ${metricQuery.dimensions.length} dimensions`}
                        isActive={focus === 'a'}
                        onFocus={() => setFocus('a')}
                        onHover={(on) => setHighlight(on ? 'a' : null)}
                    />

                    <div className={styles.join}>
                        <span className={styles.joinLabel}>joined on</span>
                        {effectiveParts.map((part, index) => (
                            <div
                                className={styles.joinRow}
                                // eslint-disable-next-line react/no-array-index-key
                                key={index}
                            >
                                <FieldSelect
                                    className={styles.side}
                                    data-side="a"
                                    size="xs"
                                    placeholder="field in this query"
                                    items={joinItemsA}
                                    item={joinItemsA.find(
                                        (candidate) =>
                                            getItemId(candidate) ===
                                            part.fieldA,
                                    )}
                                    onChange={(value) =>
                                        setJoinField(
                                            index,
                                            'fieldA',
                                            value ? getItemId(value) : null,
                                        )
                                    }
                                />
                                <span className={styles.equals}>=</span>
                                <FieldSelect
                                    className={styles.side}
                                    data-side="b"
                                    size="xs"
                                    placeholder={
                                        joinItemsB.length === 0
                                            ? 'pick a field first'
                                            : 'field in the other query'
                                    }
                                    items={joinItemsB}
                                    item={joinItemsB.find(
                                        (candidate) =>
                                            getItemId(candidate) ===
                                            part.fieldB,
                                    )}
                                    onChange={(value) =>
                                        setJoinField(
                                            index,
                                            'fieldB',
                                            value ? getItemId(value) : null,
                                        )
                                    }
                                    disabled={joinItemsB.length === 0}
                                />
                                {effectiveParts.length > 1 ? (
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        onClick={() => removeJoinPart(index)}
                                        aria-label="Remove this key"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                ) : (
                                    <span />
                                )}
                            </div>
                        ))}
                        <Anchor
                            component="button"
                            type="button"
                            size="xs"
                            c="dimmed"
                            onClick={addJoinPart}
                            style={{ justifySelf: 'center' }}
                        >
                            <Group gap={4} wrap="nowrap">
                                <MantineIcon icon={IconPlus} size={12} />
                                match on another field
                            </Group>
                        </Anchor>
                    </div>

                    <QueryToken
                        accent="var(--mantine-color-orange-5)"
                        tint="var(--mantine-color-orange-light)"
                        name={exploreBLabel ?? 'Pick a table'}
                        meta={
                            queryB.exploreName
                                ? `${queryB.metrics.length} metrics · ${queryB.dimensions.length} dimensions`
                                : 'click to choose its fields'
                        }
                        isActive={focus === 'b'}
                        onFocus={() => setFocus('b')}
                        onHover={(on) => setHighlight(on ? 'b' : null)}
                    />
                </div>

                <div className={styles.footer}>
                    <Text size="xs" c="dimmed">
                        Keep
                    </Text>
                    <SegmentedControl
                        size="xs"
                        radius="md"
                        value={joinType}
                        onChange={(value) =>
                            setJoinType(value as MergeJoinType)
                        }
                        data={keepOptions.map((option) => ({
                            value: option.value,
                            label: (
                                <Tooltip
                                    label={option.help}
                                    withinPortal
                                    position="bottom"
                                    openDelay={250}
                                    multiline
                                    w={260}
                                >
                                    <span>{option.label}</span>
                                </Tooltip>
                            ),
                        }))}
                    />
                    {blockingReason && (
                        <Text size="xs" c="dimmed" className={styles.spacer}>
                            {blockingReason}
                        </Text>
                    )}
                </div>

                {/* What the current choice does, in the terms of this merge,
                    so the trade-off reads without hovering each option. */}
                <Note tone="muted">{activeKeep.help}</Note>

                {joinKeyErrors.map((error) => (
                    <Note key={error.kind} tone="warn">
                        {error.message}
                    </Note>
                ))}

                {/* Only shown once there is a merge for it to describe. */}
                <Collapse in={!isIncomplete && repairs.length > 0}>
                    <Stack gap="xs">
                        {repairs.map((repair) => (
                            <div className={styles.repair} key={repair.side}>
                                <Note tone="warn">
                                    <b>{repair.queryLabel}</b> has more than one
                                    row per {repair.fieldLabel}, so merging
                                    would count each {repair.otherQueryLabel}{' '}
                                    row once per {repair.fieldLabel}. Show its
                                    values as columns instead.
                                </Note>
                                <MultiSelect
                                    size="xs"
                                    label={`${repair.fieldLabel} as columns`}
                                    description={
                                        repair.truncated
                                            ? `First ${MAX_PIVOT_VALUES} values; narrow the query to see the rest.`
                                            : undefined
                                    }
                                    data={repair.suggestedValues}
                                    value={repair.values}
                                    onChange={(values) =>
                                        setPivotValues(repair.side, values)
                                    }
                                    disabled={repair.isLoadingValues}
                                    searchable
                                />
                            </div>
                        ))}
                    </Stack>
                </Collapse>

                {!isIncomplete &&
                    unrepairable.map(({ side, fields }) => (
                        <Note key={side} tone="warn">
                            Query {side.toUpperCase()} has one row per{' '}
                            {fields.map(labelFor).join(' and per ')}, so rows on
                            the other side would be counted several times. Only
                            one field per query can become columns.
                        </Note>
                    ))}

                {(runErrors ?? []).map((error) => (
                    <Note
                        key={`${error.kind}-${error.sourceId ?? ''}`}
                        tone="warn"
                    >
                        {error.message}
                    </Note>
                ))}

                {mergeError && (
                    <Note tone="warn">
                        {mergeError.error?.message ?? 'Something went wrong'}
                    </Note>
                )}

                {postPivotIndex !== null && (
                    <Note tone="muted">
                        The join key is shown as columns rather than rows.
                    </Note>
                )}
            </Stack>
        </Paper>
    );
};
