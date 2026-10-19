import { FeatureFlags, getItemId, MergeJoinType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Group,
    Radio,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconInfoCircle,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { selectTableName, useExplorerSelector } from '../../explorer/store';
import { EMPTY_MERGE, PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { useMergeSourceNames } from '../hooks/useMergeSourceNames';
import { getMergeSourcesWithoutValues } from '../utils/getMergeSourcesWithoutValues';
import styles from './MergeJoinBar.module.css';

/** Guidance as a line of text. A coloured box for every hint is a lot to read. */
const Note: FC<{ tone: 'muted' | 'warn'; children: ReactNode }> = ({
    tone,
    children,
}) => (
    <Group className={styles.note} gap={6} wrap="nowrap">
        <MantineIcon
            className={styles.noteIcon}
            icon={tone === 'warn' ? IconAlertTriangle : IconInfoCircle}
            color={tone === 'warn' ? 'orange.7' : 'dimmed'}
            size={14}
        />
        <Text
            span
            size="xs"
            className={styles.noteText}
            c={tone === 'warn' ? undefined : 'dimmed'}
        >
            {children}
        </Text>
    </Group>
);

type JoinTypeOption = {
    value: MergeJoinType;
    label: string;
    help: string;
};

const SourceLabel: FC<{ label: string }> = ({ label }) => (
    <Group gap={6} wrap="nowrap" className={styles.sourceLabel}>
        <Text size="xs" fw={600} truncate title={label}>
            {label}
        </Text>
    </Group>
);

const JoinTypePicker: FC<{
    value: MergeJoinType;
    options: JoinTypeOption[];
    onChange: (value: MergeJoinType) => void;
}> = ({ value, options, onChange }) => (
    <Radio.Group
        aria-label="Join type"
        value={value}
        onChange={(nextValue) => onChange(nextValue as MergeJoinType)}
    >
        <SimpleGrid className={styles.joinTypeGrid} cols={3} spacing={4}>
            {options.map((option) => (
                <Radio.Card
                    className={styles.joinTypeCard}
                    key={option.value}
                    value={option.value}
                    radius="sm"
                    withBorder={false}
                    aria-label={`${option.label}: ${option.help}`}
                >
                    <Group
                        className={styles.joinTypeOption}
                        gap={6}
                        wrap="nowrap"
                    >
                        <Text span size="xs" fw={600} truncate>
                            {option.label}
                        </Text>
                    </Group>
                </Radio.Card>
            ))}
        </SimpleGrid>
    </Radio.Group>
);

const compactSourceList = (labels: string[]): string => {
    if (labels.length <= 2) return labels.join(' and ');
    return `${labels[0]}, ${labels[1]} and ${labels.length - 2} others`;
};

/**
 * The merge relationship, as a persistent bar under the sidebar tabs.
 *
 * Collapsed, it says what the merge is — the join key and the keep mode — so
 * the relationship never hides behind the inactive tab. Edit expands the key
 * pairs and keep modes inline; anything wrong (a missing key, a fan-out, a
 * run error) shows beneath the bar whether or not it is expanded, because an
 * error is not chrome.
 */
export const MergeJoinBar: FC<{ guided?: boolean }> = ({ guided = false }) => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const mergeContext = useMergeSafe();
    const { handleByName, nameByHandle } = useMergeSourceNames();
    const {
        isMerging,
        readOnly,
        joinType,
        repeatValuesSourceIds,
        setJoinField,
        addJoinPart,
        removeJoinPart,
        setJoinType,
        setRepeatValues,
    } = mergeContext ?? EMPTY_MERGE;
    const { runErrors, mergeResults } = mergeContext ?? {};

    const {
        first,
        sourceSetups,
        relationshipSummary,
        effectiveParts,
        labelFor,
        fanOut,
        joinKeyErrors,
        joinFieldLabel,
        primaryExploreLabel,
        isIncomplete,
        blockingReason,
    } = useMergeSetup();
    const configuredSourceSetups = sourceSetups.filter(
        (setup) => setup.additionalSource.exploreName,
    );
    const configuredLabelCounts = configuredSourceSetups.reduce<
        Record<string, number>
    >((counts, setup) => {
        const label = setup.additionalExploreLabel ?? setup.additionalSourceId;
        counts[label] = (counts[label] ?? 0) + 1;
        return counts;
    }, {});
    const displayLabelForSetup = (
        setup: (typeof configuredSourceSetups)[number],
    ) => {
        const label = setup.additionalExploreLabel ?? setup.additionalSourceId;
        return configuredLabelCounts[label] > 1
            ? `${label} · ${nameByHandle[setup.additionalSourceId] ?? setup.additionalSourceId}`
            : label;
    };

    // Expanded while the merge is incomplete — there is nothing to summarise
    // yet — and by explicit choice afterwards.
    const [editingOverride, setEditingOverride] = useState<boolean | null>(
        null,
    );
    const expanded =
        !readOnly &&
        configuredSourceSetups.length > 0 &&
        (guided || (editingOverride ?? isIncomplete));

    // A side that contributed nothing reads as a mistake unless the card
    // says so; judged only once every row is on screen.
    const sourcesWithoutValues = useMemo(
        () =>
            mergeResults
                ? getMergeSourcesWithoutValues({
                      rows: mergeResults.results.rows,
                      fieldOrigins: mergeResults.fieldOrigins,
                      complete: mergeResults.results.hasFetchedAllRows,
                  })
                : [],
        [mergeResults],
    );

    if (!mergeContext || !tableName || mergeFlag?.enabled !== true) return null;
    if (!isMerging) return null;
    if (configuredSourceSetups.length === 0) return null;

    const thisQuery = primaryExploreLabel || 'this query';
    const sourceLabels: Record<string, string> = Object.fromEntries([
        [PRIMARY_SOURCE_ID, thisQuery],
        ...sourceSetups.map((setup) => [
            setup.additionalSourceId,
            displayLabelForSetup(setup),
        ]),
    ]);
    const keepOptions: JoinTypeOption[] = [
        {
            value: MergeJoinType.INNER,
            label: 'Matches only',
            help: `Only ${joinFieldLabel} values found in every source. Everything unmatched is dropped.`,
        },
        {
            value: MergeJoinType.LEFT,
            label: `From ${thisQuery}`,
            help: `Only ${joinFieldLabel} values in ${thisQuery}. Anything found solely in another source is dropped.`,
        },
        {
            value: MergeJoinType.FULL,
            label: 'All rows',
            help: `Every ${joinFieldLabel} from any source. Where a source has no match, its columns are blank.`,
        },
    ];
    const activeKeep =
        keepOptions.find((option) => option.value === joinType) ??
        keepOptions[0];
    const mergeError = mergeResults?.results.error ?? null;

    const sourceCount = 1 + configuredSourceSetups.length;
    const primaryKeySummary = effectiveParts
        .map((part) => {
            const fieldId = part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
            return fieldId ? labelFor(fieldId) : '?';
        })
        .join(' + ');
    const summary = isIncomplete ? (
        <>
            <b>{sourceCount} sources</b> · finish matching every source
        </>
    ) : sourceCount === 2 ? (
        <>
            joined on <b>{relationshipSummary}</b> · <b>{activeKeep.label}</b>
        </>
    ) : (
        <>
            <b>{sourceCount} sources</b> · joined on <b>{primaryKeySummary}</b>{' '}
            · <b>{activeKeep.label}</b>
        </>
    );

    return (
        <Box className={styles.root}>
            {/* The bar and its expanded editor are one attached shape; only
                the notes below get breathing room. */}
            <Box>
                {!guided && (
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
                )}

                {expanded && (
                    <Box className={styles.editor} data-guided={guided}>
                        <Box>
                            <Text size="xs" fw={600}>
                                Match every source
                            </Text>
                            <Text size="xs" c="dimmed">
                                Choose the shared key once, then map the same
                                real-world field in each source.
                            </Text>
                        </Box>
                        {effectiveParts.map((part, index) => {
                            const primaryFieldId =
                                part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
                            return (
                                // eslint-disable-next-line react/no-array-index-key
                                <Box className={styles.pair} key={index}>
                                    {index > 0 ? (
                                        <Box className={styles.andDivider}>
                                            <Text
                                                span
                                                size="xs"
                                                c="dimmed"
                                                fw={600}
                                            >
                                                AND
                                            </Text>
                                        </Box>
                                    ) : null}
                                    <Box className={styles.conditionHeader}>
                                        <Text size="xs" fw={600}>
                                            {effectiveParts.length > 1
                                                ? `Key ${index + 1}`
                                                : 'Shared key'}
                                        </Text>
                                        {effectiveParts.length > 1 && (
                                            <ActionIcon
                                                size="sm"
                                                onClick={() =>
                                                    removeJoinPart(index)
                                                }
                                                aria-label={`Remove join condition ${index + 1}`}
                                            >
                                                <MantineIcon
                                                    icon={IconX}
                                                    size={14}
                                                />
                                            </ActionIcon>
                                        )}
                                    </Box>
                                    <Stack gap={4}>
                                        <SourceLabel
                                            label={`${thisQuery} (first source)`}
                                        />
                                        <FieldSelect
                                            aria-label={`${thisQuery} join field`}
                                            size="xs"
                                            placeholder="Choose a shared field"
                                            hasGrouping
                                            items={
                                                first.availablePrimaryJoinItems
                                            }
                                            item={first.availablePrimaryJoinItems.find(
                                                (candidate) =>
                                                    getItemId(candidate) ===
                                                    primaryFieldId,
                                            )}
                                            onChange={(value) =>
                                                setJoinField(
                                                    index,
                                                    PRIMARY_SOURCE_ID,
                                                    value
                                                        ? getItemId(value)
                                                        : null,
                                                )
                                            }
                                        />
                                    </Stack>
                                    <Stack
                                        className={styles.sourceMappings}
                                        gap={6}
                                    >
                                        {configuredSourceSetups.map((setup) => {
                                            const sourceId =
                                                setup.additionalSourceId;
                                            const sourceLabel =
                                                displayLabelForSetup(setup);
                                            const fieldId =
                                                part.fieldIdBySourceId[
                                                    sourceId
                                                ];
                                            const candidates =
                                                setup.getJoinCandidates(
                                                    'additional',
                                                    primaryFieldId,
                                                );

                                            return (
                                                <Box
                                                    className={
                                                        styles.sourceMapping
                                                    }
                                                    data-incomplete={!fieldId}
                                                    key={sourceId}
                                                >
                                                    <Text
                                                        className={
                                                            styles.mappingOperator
                                                        }
                                                        aria-hidden
                                                        size="sm"
                                                        fw={600}
                                                    >
                                                        =
                                                    </Text>
                                                    <Stack
                                                        gap={4}
                                                        className={
                                                            styles.mappingField
                                                        }
                                                    >
                                                        <SourceLabel
                                                            label={sourceLabel}
                                                        />
                                                        <FieldSelect
                                                            aria-label={`${sourceLabel} join field`}
                                                            size="xs"
                                                            placeholder="Choose its matching field"
                                                            hasGrouping
                                                            items={
                                                                setup.availableAdditionalJoinItems
                                                            }
                                                            suggestedItems={
                                                                candidates.suggested
                                                            }
                                                            inactiveItemIds={candidates.incompatible.map(
                                                                getItemId,
                                                            )}
                                                            item={setup.availableAdditionalJoinItems.find(
                                                                (candidate) =>
                                                                    getItemId(
                                                                        candidate,
                                                                    ) ===
                                                                    fieldId,
                                                            )}
                                                            onChange={(value) =>
                                                                setJoinField(
                                                                    index,
                                                                    sourceId,
                                                                    value
                                                                        ? getItemId(
                                                                              value,
                                                                          )
                                                                        : null,
                                                                )
                                                            }
                                                        />
                                                    </Stack>
                                                </Box>
                                            );
                                        })}
                                    </Stack>
                                </Box>
                            );
                        })}

                        <Anchor
                            component="button"
                            type="button"
                            size="xs"
                            c="dimmed"
                            onClick={addJoinPart}
                        >
                            <Group gap={4} wrap="nowrap">
                                <MantineIcon icon={IconPlus} size={12} />
                                Add join condition
                            </Group>
                        </Anchor>

                        <Stack gap={4} mt={2}>
                            <Text size="xs" fw={600}>
                                Join type
                            </Text>
                            <JoinTypePicker
                                value={joinType}
                                options={keepOptions}
                                onChange={setJoinType}
                            />
                        </Stack>

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
                <Note key={error.message} tone="warn">
                    {error.message}
                </Note>
            ))}

            {sourcesWithoutValues.map((sourceId) => {
                const sourceHandle = handleByName[sourceId] ?? sourceId;
                const emptyLabel = sourceLabels[sourceHandle] ?? sourceId;
                const otherLabel = compactSourceList(
                    Object.entries(sourceLabels)
                        .filter(([id]) => id !== sourceHandle)
                        .map(([, label]) => label),
                );
                return (
                    <Note key={`empty-${sourceId}`} tone="muted">
                        {emptyLabel}'s columns are blank on every row: its query
                        returned no rows matching {otherLabel} on{' '}
                        {joinFieldLabel}.
                    </Note>
                );
            })}

            {!isIncomplete &&
                fanOut.map(({ sourceId, fields }) => {
                    const splitLabel = sourceLabels[sourceId];
                    const otherSourceIds = Object.keys(sourceLabels).filter(
                        (id) => id !== sourceId,
                    );
                    const otherLabel = compactSourceList(
                        otherSourceIds.map((id) => sourceLabels[id]),
                    );
                    return (
                        <Note key={sourceId} tone="warn">
                            {splitLabel} is split by{' '}
                            {fields.map(labelFor).join(' and ')}, which{' '}
                            {otherLabel} does not have. Merging would repeat{' '}
                            {otherLabel}'s rows once per value. Remove{' '}
                            {fields.length === 1 ? 'it' : 'them'}, select{' '}
                            {fields.length === 1 ? 'it' : 'them'} on all queries
                            and join on {fields.length === 1 ? 'it' : 'them'},
                            or{' '}
                            {!readOnly && (
                                <Anchor
                                    component="button"
                                    type="button"
                                    size="xs"
                                    fw={600}
                                    onClick={() =>
                                        otherSourceIds.forEach((id) =>
                                            setRepeatValues(id, true),
                                        )
                                    }
                                >
                                    repeat {otherLabel}'s values on every{' '}
                                    {splitLabel} row
                                </Anchor>
                            )}
                            .
                        </Note>
                    );
                })}

            {/* Repeating is a lookup the user asked for; saying so keeps a
                repeated metric from reading as a per-row measurement. */}
            {repeatValuesSourceIds
                .filter((sourceId) => sourceId in sourceLabels)
                .map((sourceId) => {
                    const repeatingLabel = sourceLabels[sourceId];
                    const otherLabel = compactSourceList(
                        Object.entries(sourceLabels)
                            .filter(([id]) => id !== sourceId)
                            .map(([, label]) => label),
                    );
                    return (
                        <Note key={`repeat-${sourceId}`} tone="muted">
                            {repeatingLabel}'s values repeat on every{' '}
                            {otherLabel} row with the same {joinFieldLabel}. Its
                            columns have no totals here.{' '}
                            {!readOnly && (
                                <Anchor
                                    component="button"
                                    type="button"
                                    size="xs"
                                    fw={600}
                                    onClick={() =>
                                        setRepeatValues(sourceId, false)
                                    }
                                >
                                    Stop repeating
                                </Anchor>
                            )}
                        </Note>
                    );
                })}

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
