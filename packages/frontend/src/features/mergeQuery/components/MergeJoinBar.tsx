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
import { useId, useMemo, useState, type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
}> = ({ value, options, onChange }) => {
    const { t } = useTranslation('mergeQuery');
    return (
        <Radio.Group
            aria-label={t('joinBar.joinType')}
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
                        aria-label={t('joinTypes.optionAriaLabel', {
                            label: option.label,
                            help: option.help,
                        })}
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
    const { t } = useTranslation('mergeQuery');
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
    const additionalSource = additionalSources[0];
    const additionalSourceId = additionalSource?.id;
    const { runErrors, mergeResults } = mergeContext ?? {};

    const {
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

    const thisQuery = primaryExploreLabel || t('labels.thisQuery');
    const otherQuery = additionalExploreLabel || t('labels.otherQuery');
    const keepOptions: JoinTypeOption[] = [
        {
            value: MergeJoinType.INNER,
            label: t('joinTypes.inner'),
            help: t('joinTypes.innerHelp', {
                field: joinFieldLabel,
                thisQuery,
                otherQuery,
            }),
        },
        {
            value: MergeJoinType.LEFT,
            label: t('joinTypes.left'),
            help: t('joinTypes.leftHelp', {
                field: joinFieldLabel,
                thisQuery,
                otherQuery,
            }),
        },
        {
            value: MergeJoinType.FULL,
            label: t('joinTypes.fullOuter'),
            help: t('joinTypes.fullOuterHelp', { field: joinFieldLabel }),
        },
    ];
    const activeKeep =
        keepOptions.find((option) => option.value === joinType) ??
        keepOptions[0];
    const mergeError = mergeResults?.results.error ?? null;

    const joinedKeys = effectiveParts
        .map((part) => {
            const primaryFieldId = part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
            const additionalFieldId =
                part.fieldIdBySourceId[additionalSourceId];
            return getJoinClauseLabel(
                thisQuery,
                primaryFieldId ? labelFor(primaryFieldId) : '?',
                otherQuery,
                additionalFieldId ? labelFor(additionalFieldId) : '?',
            );
        })
        .join(` ${t('labels.and')} `);
    const summary = isIncomplete ? (
        <Trans
            t={t}
            i18nKey="joinBar.matchSummary"
            values={{ thisQuery, otherQuery }}
            components={{ bold: <b /> }}
        />
    ) : (
        <Trans
            t={t}
            i18nKey="joinBar.joinedOnSummary"
            values={{ keys: joinedKeys, keep: activeKeep.label }}
            components={{ bold: <b /> }}
        />
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
                                {expanded
                                    ? t('joinBar.done')
                                    : t('joinBar.edit')}
                            </Anchor>
                        )}
                    </Box>
                )}

                {expanded && (
                    <Box className={styles.editor} data-guided={guided}>
                        <Text size="xs" fw={600}>
                            {t('joinBar.joinConditions')}
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
                                                {t('labels.and')}
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
                                                    {t('joinBar.suggested')}{' '}
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
                                                    {t('joinBar.useSuggestion')}
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
                                                aria-label={t(
                                                    'joinBar.joinFieldAriaLabel',
                                                    { label: thisQuery },
                                                )}
                                                size="xs"
                                                placeholder={t(
                                                    'joinBar.chooseField',
                                                )}
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
                                                aria-label={t(
                                                    'joinBar.joinFieldAriaLabel',
                                                    { label: otherQuery },
                                                )}
                                                size="xs"
                                                placeholder={t(
                                                    'joinBar.chooseField',
                                                )}
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
                                                aria-label={t(
                                                    'joinBar.removeJoinCondition',
                                                    { index: index + 1 },
                                                )}
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
                                {t('joinBar.addJoinCondition')}
                            </Group>
                        </Anchor>

                        <Stack gap={4} mt={2}>
                            <Text size="xs" fw={600}>
                                {t('joinBar.joinType')}
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
                // Results name sources as they ran
                const isPrimary = handleByName[sourceId] === PRIMARY_SOURCE_ID;
                const emptyLabel = isPrimary ? thisQuery : otherQuery;
                const otherLabel = isPrimary ? otherQuery : thisQuery;
                return (
                    <Note key={`empty-${sourceId}`} tone="muted">
                        {t('joinBar.emptySource', {
                            emptyLabel,
                            otherLabel,
                            field: joinFieldLabel,
                        })}
                    </Note>
                );
            })}

            {!isIncomplete &&
                fanOut.map(({ sourceId, fields }) => {
                    const splitLabel =
                        sourceId === PRIMARY_SOURCE_ID
                            ? primaryExploreLabel
                            : additionalExploreLabel;
                    const otherSourceId =
                        sourceId === PRIMARY_SOURCE_ID
                            ? additionalSourceId
                            : PRIMARY_SOURCE_ID;
                    const otherLabel =
                        sourceId === PRIMARY_SOURCE_ID
                            ? additionalExploreLabel
                            : primaryExploreLabel;
                    return (
                        <Note key={sourceId} tone="warn">
                            {t('joinBar.fanOut', {
                                count: fields.length,
                                split: splitLabel,
                                fields: fields
                                    .map(labelFor)
                                    .join(t('joinBar.fieldsSeparator')),
                                other: otherLabel,
                            })}
                            {!readOnly && (
                                <Trans
                                    t={t}
                                    i18nKey="joinBar.fanOutRepeat"
                                    values={{
                                        other: otherLabel,
                                        split: splitLabel,
                                    }}
                                    components={{
                                        anchor: (
                                            <Anchor
                                                component="button"
                                                type="button"
                                                size="xs"
                                                fw={600}
                                                onClick={() =>
                                                    setRepeatValues(
                                                        otherSourceId,
                                                        true,
                                                    )
                                                }
                                            />
                                        ),
                                    }}
                                />
                            )}
                            .
                        </Note>
                    );
                })}

            {/* Repeating is a lookup the user asked for; saying so keeps a
                repeated metric from reading as a per-row measurement. */}
            {repeatValuesSourceIds
                .filter(
                    (sourceId) =>
                        sourceId === PRIMARY_SOURCE_ID ||
                        sourceId === additionalSourceId,
                )
                .map((sourceId) => {
                    const repeatingLabel =
                        sourceId === PRIMARY_SOURCE_ID
                            ? primaryExploreLabel
                            : additionalExploreLabel;
                    const otherLabel =
                        sourceId === PRIMARY_SOURCE_ID
                            ? additionalExploreLabel
                            : primaryExploreLabel;
                    return (
                        <Note key={`repeat-${sourceId}`} tone="muted">
                            {t('joinBar.repeating', {
                                repeating: repeatingLabel,
                                other: otherLabel,
                                field: joinFieldLabel,
                            })}{' '}
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
                                    {t('joinBar.stopRepeating')}
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
                    {mergeError.error?.message ??
                        t('joinBar.somethingWentWrong')}
                </Note>
            )}
        </Box>
    );
};
