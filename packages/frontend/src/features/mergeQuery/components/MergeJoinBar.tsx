import { FeatureFlags, getItemId, MergeJoinType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Group,
    SegmentedControl,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconInfoCircle,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { selectTableName, useExplorerSelector } from '../../explorer/store';
import { EMPTY_MERGE } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import styles from './MergeJoinBar.module.css';

/** Guidance as a line of text. A coloured box for every hint is a lot to read. */
const Note: FC<{ tone: 'muted' | 'warn'; children: ReactNode }> = ({
    tone,
    children,
}) => (
    <Box className={styles.note}>
        <MantineIcon
            className={styles.noteIcon}
            icon={tone === 'warn' ? IconAlertTriangle : IconInfoCircle}
            color={tone === 'warn' ? 'orange.7' : 'gray.6'}
        />
        <Text size="xs" c={tone === 'warn' ? undefined : 'dimmed'}>
            {children}
        </Text>
    </Box>
);

/**
 * The merge relationship, as a persistent bar under the sidebar tabs.
 *
 * Collapsed, it says what the merge is — the join key and the keep mode — so
 * the relationship never hides behind the inactive tab. Edit expands the key
 * pairs and keep modes inline; anything wrong (a missing key, a fan-out, a
 * run error) shows beneath the bar whether or not it is expanded, because an
 * error is not chrome.
 */
export const MergeJoinBar: FC = () => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const mergeContext = useMergeSafe();
    const {
        isMerging,
        readOnly,
        joinType,
        setJoinField,
        addJoinPart,
        removeJoinPart,
        setJoinType,
    } = mergeContext ?? EMPTY_MERGE;
    const { runErrors, mergeResults } = mergeContext ?? {};

    const {
        effectiveParts,
        labelFor,
        fanOut,
        joinKeyErrors,
        joinFieldLabel,
        joinItemsA,
        joinItemsB,
        exploreALabel,
        exploreBLabel,
        isIncomplete,
        blockingReason,
    } = useMergeSetup();

    // Expanded while the merge is incomplete — there is nothing to summarise
    // yet — and by explicit choice afterwards.
    const [editingOverride, setEditingOverride] = useState<boolean | null>(
        null,
    );
    const expanded = !readOnly && (editingOverride ?? isIncomplete);

    if (!mergeContext || !tableName || mergeFlag?.enabled !== true) return null;
    if (!isMerging) return null;

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

    const summary = isIncomplete ? (
        <>
            match <b>{thisQuery}</b> and <b>{otherQuery}</b> on a shared field
        </>
    ) : (
        <>
            joined on{' '}
            <b>
                {effectiveParts
                    .map((part) => (part.fieldA ? labelFor(part.fieldA) : '?'))
                    .join(' + ')}
            </b>{' '}
            · keep <b>{activeKeep.label}</b>
        </>
    );

    return (
        <Box className={styles.root}>
            {/* The bar and its expanded editor are one attached shape; only
                the notes below get breathing room. */}
            <Box>
                <Box className={styles.bar} data-expanded={expanded}>
                    <Text className={styles.summary} span truncate>
                        {summary}
                    </Text>
                    {!readOnly && (
                        <Anchor
                            component="button"
                            type="button"
                            size="xs"
                            fw={600}
                            onClick={() => setEditingOverride(!expanded)}
                        >
                            {expanded ? 'Done' : 'Edit'}
                        </Anchor>
                    )}
                </Box>

                {expanded && (
                    <Box className={styles.editor}>
                        {effectiveParts.map((part, index) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <Box className={styles.pair} key={index}>
                                <Box className={styles.pairHeader}>
                                    <Text span size="xs" c="dimmed">
                                        {exploreALabel} matches{' '}
                                        {exploreBLabel ?? 'Query B'} on
                                    </Text>
                                    {effectiveParts.length > 1 && (
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="xs"
                                            onClick={() =>
                                                removeJoinPart(index)
                                            }
                                            aria-label="Remove this key"
                                        >
                                            <MantineIcon
                                                icon={IconX}
                                                size={12}
                                            />
                                        </ActionIcon>
                                    )}
                                </Box>
                                <FieldSelect
                                    size="xs"
                                    placeholder="field in this query"
                                    hasGrouping
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
                                <FieldSelect
                                    size="xs"
                                    placeholder={
                                        joinItemsB.length === 0
                                            ? 'pick a field first'
                                            : 'field in the other query'
                                    }
                                    hasGrouping
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
                            </Box>
                        ))}

                        <Anchor
                            component="button"
                            type="button"
                            size="xs"
                            c="dimmed"
                            onClick={addJoinPart}
                        >
                            <Group gap={4} wrap="nowrap">
                                <MantineIcon icon={IconPlus} size={12} />
                                match on another field
                            </Group>
                        </Anchor>

                        <Group gap="xs" wrap="nowrap" mt={4}>
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
                                            <Text span>{option.label}</Text>
                                        </Tooltip>
                                    ),
                                }))}
                            />
                        </Group>

                        {/* What the current choice does, in the terms of this
                        merge, so the trade-off reads without hovering. */}
                        <Note tone="muted">{activeKeep.help}</Note>
                    </Box>
                )}
            </Box>

            {blockingReason && !expanded && (
                <Note tone="muted">{blockingReason}</Note>
            )}

            {joinKeyErrors.map((error) => (
                <Note key={error.kind} tone="warn">
                    {error.message}
                </Note>
            ))}

            {!isIncomplete &&
                fanOut.map(({ side, fields }) => (
                    <Note key={side} tone="warn">
                        Query {side.toUpperCase()} is split by{' '}
                        {fields.map(labelFor).join(' and ')}, which the other
                        query does not have. Merging would repeat the other
                        query's rows once per value. Remove{' '}
                        {fields.length === 1 ? 'it' : 'them'}, or select{' '}
                        {fields.length === 1 ? 'it' : 'them'} on both queries
                        and join on {fields.length === 1 ? 'it' : 'them'}.
                    </Note>
                ))}

            {(runErrors ?? []).map((error) => (
                <Note key={`${error.kind}-${error.sourceId ?? ''}`} tone="warn">
                    {error.message}
                </Note>
            ))}

            {mergeError && (
                <Note tone="warn">
                    {mergeError.error?.message ?? 'Something went wrong'}
                </Note>
            )}
        </Box>
    );
};
