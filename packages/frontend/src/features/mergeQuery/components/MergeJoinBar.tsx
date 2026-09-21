import { FeatureFlags, getItemId, MergeJoinType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Group,
    Radio,
    Select,
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
import { useId, useMemo, useState, type FC, type ReactNode } from 'react';
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
import { getJoinClauseLabel } from './mergeJoinLabels';

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

const JoinTypeDiagram: FC<{ type: MergeJoinType }> = ({ type }) => {
    const clipId = useId();

    return (
        <svg aria-hidden className={styles.joinTypeDiagram} viewBox="0 0 48 28">
            <defs>
                <clipPath id={clipId}>
                    <circle cx="18" cy="14" r="10" />
                </clipPath>
            </defs>
            {type === MergeJoinType.LEFT ? (
                <circle
                    className={styles.retainedRegion}
                    cx="18"
                    cy="14"
                    r="10"
                />
            ) : null}
            {type === MergeJoinType.FULL ? (
                <>
                    <circle
                        className={styles.retainedRegion}
                        cx="18"
                        cy="14"
                        r="10"
                    />
                    <circle
                        className={styles.retainedRegion}
                        cx="30"
                        cy="14"
                        r="10"
                    />
                </>
            ) : null}
            {type === MergeJoinType.INNER ? (
                <circle
                    className={styles.retainedRegion}
                    cx="30"
                    cy="14"
                    r="10"
                    clipPath={`url(#${clipId})`}
                />
            ) : null}
            <circle className={styles.circleOutline} cx="18" cy="14" r="10" />
            <circle className={styles.circleOutline} cx="30" cy="14" r="10" />
        </svg>
    );
};

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
                        <JoinTypeDiagram type={option.value} />
                        <Text span size="xs" fw={600} truncate>
                            {option.label}
                        </Text>
                    </Group>
                </Radio.Card>
            ))}
        </SimpleGrid>
    </Radio.Group>
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
export const MergeJoinBar: FC<{ guided?: boolean }> = ({ guided = false }) => {
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const mergeContext = useMergeSafe();
    const { handleByName } = useMergeSourceNames();
    const {
        isMerging,
        readOnly,
        additionalSources,
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
        additionalSource,
        additionalSourceId,
        sourceSetups,
        effectiveParts,
        labelFor,
        fanOut,
        joinKeyErrors,
        joinFieldLabel,
        availablePrimaryJoinItems,
        availableAdditionalJoinItems,
        getJoinCandidates,
        suggestedAvailablePair,
        primaryExploreLabel,
        additionalExploreLabel,
        isIncomplete,
        blockingReason,
    } = useMergeSetup();

    // Expanded while the merge is incomplete — there is nothing to summarise
    // yet — and by explicit choice afterwards.
    const [editingOverride, setEditingOverride] = useState<boolean | null>(
        null,
    );
    const expanded =
        !readOnly &&
        !!additionalSource?.exploreName &&
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
    if (!additionalSource?.exploreName || !additionalSourceId) return null;

    const thisQuery = primaryExploreLabel || 'this query';
    const otherQuery = additionalExploreLabel || 'the other query';
    const sourceLabels = Object.fromEntries([
        [PRIMARY_SOURCE_ID, thisQuery],
        ...sourceSetups.map((setup) => [
            setup.additionalSourceId,
            setup.additionalExploreLabel ?? setup.additionalSourceId,
        ]),
    ]);
    const keepOptions: JoinTypeOption[] = [
        {
            value: MergeJoinType.INNER,
            label: 'Inner',
            help: `Inner join · Only the ${joinFieldLabel} values found in every query. Everything unmatched is dropped.`,
        },
        {
            value: MergeJoinType.LEFT,
            label: 'Left',
            help: `Left join · Only the ${joinFieldLabel} values in ${thisQuery}. Anything found solely in another query is dropped.`,
        },
        {
            value: MergeJoinType.FULL,
            label: 'Full outer',
            help: `Full outer join · Every ${joinFieldLabel} from any query. Where a query has no match, its columns are blank.`,
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
                    .map((part) => {
                        const primaryFieldId =
                            part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
                        const additionalFieldId =
                            part.fieldIdBySourceId[additionalSourceId];
                        return getJoinClauseLabel(
                            thisQuery,
                            primaryFieldId ? labelFor(primaryFieldId) : '?',
                            otherQuery,
                            additionalFieldId
                                ? labelFor(additionalFieldId)
                                : '?',
                        );
                    })
                    .join(' AND ')}
            </b>{' '}
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
                        {additionalSources.length > 1 && (
                            <Select
                                label="Source to match"
                                size="xs"
                                value={additionalSourceId}
                                data={sourceSetups.map((setup) => ({
                                    value: setup.additionalSourceId,
                                    label:
                                        setup.additionalExploreLabel ??
                                        'Choose data to combine',
                                }))}
                                onChange={(id) =>
                                    id &&
                                    mergeContext.setFocus({
                                        kind: 'source',
                                        sourceId: id,
                                    })
                                }
                            />
                        )}
                        <Text size="xs" fw={600}>
                            Join conditions
                        </Text>
                        {effectiveParts.map((part, index) => {
                            const primaryCandidates = getJoinCandidates(
                                'primary',
                                part.fieldIdBySourceId[additionalSourceId],
                            );
                            const additionalCandidates = getJoinCandidates(
                                'additional',
                                part.fieldIdBySourceId[PRIMARY_SOURCE_ID],
                            );
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
                                    {index === 0 &&
                                        !part.fieldIdBySourceId[
                                            PRIMARY_SOURCE_ID
                                        ] &&
                                        !part.fieldIdBySourceId[
                                            additionalSourceId
                                        ] &&
                                        suggestedAvailablePair && (
                                            <Box className={styles.suggestion}>
                                                <Text size="xs" c="dimmed">
                                                    Suggested:{' '}
                                                    <Text
                                                        span
                                                        inherit
                                                        fw={600}
                                                        c="gray.7"
                                                    >
                                                        {getJoinClauseLabel(
                                                            thisQuery,
                                                            labelFor(
                                                                suggestedAvailablePair[
                                                                    PRIMARY_SOURCE_ID
                                                                ],
                                                            ),
                                                            otherQuery,
                                                            labelFor(
                                                                suggestedAvailablePair[
                                                                    additionalSourceId
                                                                ],
                                                            ),
                                                        )}
                                                    </Text>
                                                </Text>
                                                <Anchor
                                                    component="button"
                                                    type="button"
                                                    size="xs"
                                                    fw={600}
                                                    onClick={() => {
                                                        const primaryField =
                                                            suggestedAvailablePair[
                                                                PRIMARY_SOURCE_ID
                                                            ];
                                                        const additionalField =
                                                            suggestedAvailablePair[
                                                                additionalSourceId
                                                            ];
                                                        if (
                                                            !primaryField ||
                                                            !additionalField
                                                        )
                                                            return;
                                                        setJoinField(
                                                            index,
                                                            PRIMARY_SOURCE_ID,
                                                            primaryField,
                                                        );
                                                        setJoinField(
                                                            index,
                                                            additionalSourceId,
                                                            additionalField,
                                                        );
                                                    }}
                                                >
                                                    Use suggestion
                                                </Anchor>
                                            </Box>
                                        )}
                                    <Box className={styles.pairFields}>
                                        <Stack
                                            gap={4}
                                            className={styles.fieldSide}
                                        >
                                            <SourceLabel label={thisQuery} />
                                            <FieldSelect
                                                aria-label={`${thisQuery} join field`}
                                                size="xs"
                                                placeholder="Choose a field"
                                                hasGrouping
                                                items={
                                                    availablePrimaryJoinItems
                                                }
                                                suggestedItems={
                                                    primaryCandidates.suggested
                                                }
                                                inactiveItemIds={primaryCandidates.incompatible.map(
                                                    getItemId,
                                                )}
                                                item={availablePrimaryJoinItems.find(
                                                    (candidate) =>
                                                        getItemId(candidate) ===
                                                        part.fieldIdBySourceId[
                                                            PRIMARY_SOURCE_ID
                                                        ],
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
                                        <Text
                                            className={styles.operator}
                                            aria-hidden
                                            size="sm"
                                            fw={600}
                                        >
                                            =
                                        </Text>
                                        <Stack
                                            gap={4}
                                            className={styles.fieldSide}
                                        >
                                            <SourceLabel label={otherQuery} />
                                            <FieldSelect
                                                aria-label={`${otherQuery} join field`}
                                                size="xs"
                                                placeholder="Choose a field"
                                                hasGrouping
                                                items={
                                                    availableAdditionalJoinItems
                                                }
                                                suggestedItems={
                                                    additionalCandidates.suggested
                                                }
                                                inactiveItemIds={additionalCandidates.incompatible.map(
                                                    getItemId,
                                                )}
                                                item={availableAdditionalJoinItems.find(
                                                    (candidate) =>
                                                        getItemId(candidate) ===
                                                        part.fieldIdBySourceId[
                                                            additionalSourceId
                                                        ],
                                                )}
                                                onChange={(value) =>
                                                    setJoinField(
                                                        index,
                                                        additionalSourceId,
                                                        value
                                                            ? getItemId(value)
                                                            : null,
                                                    )
                                                }
                                            />
                                        </Stack>
                                        {effectiveParts.length > 1 ? (
                                            <ActionIcon
                                                className={styles.removeKey}
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
                                        ) : (
                                            <Box
                                                aria-hidden
                                                className={
                                                    styles.removeKeySpacer
                                                }
                                            />
                                        )}
                                    </Box>
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
                <Note key={error.kind} tone="warn">
                    {error.message}
                </Note>
            ))}

            {sourcesWithoutValues.map((sourceId) => {
                const sourceHandle = handleByName[sourceId] ?? sourceId;
                const emptyLabel = sourceLabels[sourceHandle] ?? sourceId;
                const otherLabel = Object.entries(sourceLabels)
                    .filter(([id]) => id !== sourceHandle)
                    .map(([, label]) => label)
                    .join(', ');
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
                    const otherLabel = otherSourceIds
                        .map((id) => sourceLabels[id])
                        .join(', ');
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
                    const otherLabel = Object.entries(sourceLabels)
                        .filter(([id]) => id !== sourceId)
                        .map(([, label]) => label)
                        .join(', ');
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
