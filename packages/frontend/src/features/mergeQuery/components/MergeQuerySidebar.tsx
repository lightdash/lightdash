import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isMetric,
    getTotalFilterRules,
    type Explore,
    type FilterableField,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconX } from '@tabler/icons-react';
import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import ExploreTree from '../../../components/Explorer/ExploreTree';
import SelectedFieldsSection, {
    type SelectedField,
} from '../../../components/Explorer/ExploreTree/SelectedFieldsSection';
import { ItemDetailProvider } from '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider';
import {
    selectFilters,
    selectMetricQuery,
    useExplorerSelector,
} from '../../explorer/store';
import { getNextMergeSourceId, PRIMARY_SOURCE_ID } from '../constants';
import { useMerge } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { useMergeSourceFilter } from '../hooks/useMergeSourceFilter';
import styles from './MergeQuerySidebar.module.css';
import { MergeSourceTree } from './MergeSourceTree';

const DatasetHeader: FC<{
    label: string;
    description: string;
    needsAttention?: boolean;
    open: boolean;
    onClick: () => void;
    onRemove?: () => void;
}> = ({ label, description, needsAttention, open, onClick, onRemove }) => (
    <Box className={styles.header} data-open={open}>
        <UnstyledButton className={styles.headerButton} onClick={onClick}>
            <Box className={styles.headerCopy}>
                <Text size="sm" fw={600} truncate title={label}>
                    {label}
                </Text>
                <Text size="xs" c={needsAttention ? 'orange.8' : 'dimmed'}>
                    {description}
                </Text>
            </Box>
            <MantineIcon
                icon={open ? IconChevronDown : IconChevronRight}
                size={15}
                color="gray.6"
            />
        </UnstyledButton>
        {onRemove && (
            <ActionIcon
                className={styles.remove}
                size="sm"
                aria-label="Remove combined data"
                onClick={onRemove}
            >
                <MantineIcon icon={IconX} size={14} />
            </ActionIcon>
        )}
    </Box>
);

/** One continuous field builder: shared output, then one expandable dataset at a time. */
export const MergeQuerySidebar: FC<{
    primaryExplore: Explore;
    onPrimaryFieldChange: (fieldId: string, isDimension: boolean) => void;
    isChoosingAdditionalExplore: boolean;
    setIsChoosingAdditionalExplore: Dispatch<SetStateAction<boolean>>;
}> = ({
    primaryExplore,
    onPrimaryFieldChange,
    isChoosingAdditionalExplore,
    setIsChoosingAdditionalExplore,
}) => {
    const merge = useMerge();
    const additionalSource =
        merge.additionalSources.find(
            (source) =>
                merge.focus.kind === 'source' &&
                source.id === merge.focus.sourceId,
        ) ?? merge.additionalSources[0];
    const additionalSourceId = additionalSource?.id;
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const primaryFilters = useExplorerSelector(selectFilters);
    const mergeSetup = useMergeSetup();
    const addSourceFilter = useMergeSourceFilter();
    const [openSourceId, setOpenSourceId] = useState<string | null>(
        merge.focus.kind === 'source' ? merge.focus.sourceId : null,
    );

    useEffect(() => {
        if (additionalSourceId && !additionalSource?.exploreName) {
            setOpenSourceId(additionalSourceId);
        }
    }, [additionalSource?.exploreName, additionalSourceId]);

    const toggle = (sourceId: string) => {
        setIsChoosingAdditionalExplore(false);
        setOpenSourceId((current) => (current === sourceId ? null : sourceId));
        if (openSourceId !== sourceId) {
            merge.setFocus({ kind: 'source', sourceId });
        }
    };
    const primaryCount =
        metricQuery.dimensions.length + metricQuery.metrics.length;
    const unfinishedSource = merge.additionalSources.find(
        (source) => !source.exploreName,
    );
    const filteredFieldIds = useMemo<Record<string, Set<string>>>(
        () =>
            Object.fromEntries(
                [
                    [PRIMARY_SOURCE_ID, primaryFilters] as const,
                    ...merge.additionalSources.map(
                        (source) => [source.id, source.filters] as const,
                    ),
                ].map(([id, filters]) => [
                    id,
                    new Set(
                        getTotalFilterRules(filters).flatMap((rule) =>
                            'fieldId' in rule.target
                                ? [rule.target.fieldId]
                                : [],
                        ),
                    ),
                ]),
            ),
        [merge.additionalSources, primaryFilters],
    );
    const selectedFields = useMemo<SelectedField[]>(() => {
        const primaryLabel = mergeSetup.primaryExploreLabel ?? 'First data';
        const sameLabel =
            mergeSetup.sourceLabels.filter((label) => label === primaryLabel)
                .length > 1;
        const selectedPrimary = [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
        ].flatMap((fieldId) => {
            const item = mergeSetup.primaryItemMap[fieldId];
            if (
                !item ||
                (!isDimension(item) &&
                    !isMetric(item) &&
                    !isCustomDimension(item) &&
                    !isAdditionalMetric(item))
            ) {
                return [];
            }
            return [
                {
                    fieldId,
                    selectionKey: `${PRIMARY_SOURCE_ID}:${fieldId}`,
                    item,
                    tableLabel: sameLabel
                        ? `${primaryLabel} · First`
                        : primaryLabel,
                    isDimension: metricQuery.dimensions.includes(fieldId),
                    onDeselect: onPrimaryFieldChange,
                    onAddFilter: (field: FilterableField) =>
                        addSourceFilter(PRIMARY_SOURCE_ID, field),
                    isFiltered:
                        filteredFieldIds[PRIMARY_SOURCE_ID]?.has(fieldId) ??
                        false,
                    basicActionsOnly: true,
                },
            ];
        });
        const selectedAdditional = mergeSetup.sourceSetups.flatMap(
            (sourceSetup) => {
                const additionalSource = sourceSetup.additionalSource;
                const additionalSourceId = additionalSource.id;
                const additionalSourceLabel =
                    sourceSetup.additionalExploreLabel ?? 'Combined data';
                return [
                    ...(additionalSource?.dimensions ?? []),
                    ...(additionalSource?.metrics ?? []),
                ].flatMap((fieldId) => {
                    const item = sourceSetup.additionalItemMap[fieldId];
                    if (
                        !item ||
                        (!isDimension(item) &&
                            !isMetric(item) &&
                            !isCustomDimension(item) &&
                            !isAdditionalMetric(item))
                    ) {
                        return [];
                    }
                    return [
                        {
                            fieldId,
                            selectionKey: `${additionalSourceId}:${fieldId}`,
                            item,
                            tableLabel:
                                mergeSetup.sourceLabels.filter(
                                    (label) => label === additionalSourceLabel,
                                ).length > 1
                                    ? `${additionalSourceLabel} · ${mergeSetup.sourceNames.nameByHandle[additionalSourceId]}`
                                    : additionalSourceLabel,
                            isDimension:
                                additionalSource?.dimensions.includes(
                                    fieldId,
                                ) ?? false,
                            onDeselect: (id: string, isDimension: boolean) =>
                                additionalSourceId &&
                                merge.toggleSourceField(
                                    additionalSourceId,
                                    id,
                                    isDimension,
                                ),
                            onAddFilter: (field: FilterableField) =>
                                additionalSourceId &&
                                addSourceFilter(additionalSourceId, field),
                            isFiltered:
                                (additionalSourceId
                                    ? filteredFieldIds[additionalSourceId]?.has(
                                          fieldId,
                                      )
                                    : false) ?? false,
                            basicActionsOnly: true,
                        },
                    ];
                });
            },
        );

        return [...selectedPrimary, ...selectedAdditional];
    }, [
        additionalSource,
        additionalSourceId,
        addSourceFilter,
        filteredFieldIds,
        merge,
        mergeSetup,
        metricQuery,
        onPrimaryFieldChange,
    ]);

    return (
        <Box className={styles.root}>
            <SelectedFieldsSection
                fields={selectedFields}
                onDeselect={onPrimaryFieldChange}
                heading={`Selected for result · ${selectedFields.length}`}
                showAllFieldsDivider={false}
            />

            <Box className={styles.datasets}>
                <Text className={styles.sourcesLabel}>
                    Data sources · {merge.additionalSources.length + 1}
                </Text>
                <Box className={styles.sourceList}>
                    <DatasetHeader
                        label={
                            mergeSetup.primaryExploreLabel ??
                            primaryExplore.label
                        }
                        description={`${primaryCount} selected · first source`}
                        open={openSourceId === PRIMARY_SOURCE_ID}
                        onClick={() => toggle(PRIMARY_SOURCE_ID)}
                    />
                    {mergeSetup.sourceSetups.map((sourceSetup) => {
                        const source = sourceSetup.additionalSource;
                        const sourceLabel =
                            sourceSetup.additionalExploreLabel ??
                            'Choose data to combine';
                        const duplicateLabel =
                            mergeSetup.sourceLabels.filter(
                                (label) => label === sourceLabel,
                            ).length > 1;
                        const missingJoin = mergeSetup.effectiveParts.some(
                            (part) => !part.fieldIdBySourceId[source.id],
                        );
                        const selectedCount =
                            source.dimensions.length + source.metrics.length;
                        const description = !source.exploreName
                            ? 'Choose an explore'
                            : source.metrics.length === 0
                              ? 'Select at least one metric'
                              : missingJoin
                                ? 'Choose its matching field'
                                : `${selectedCount} selected · ready`;
                        return (
                            <DatasetHeader
                                key={source.id}
                                label={
                                    duplicateLabel
                                        ? `${sourceLabel} · ${mergeSetup.sourceNames.nameByHandle[source.id]}`
                                        : sourceLabel
                                }
                                description={description}
                                needsAttention={
                                    !source.exploreName ||
                                    source.metrics.length === 0 ||
                                    missingJoin
                                }
                                open={openSourceId === source.id}
                                onClick={() => toggle(source.id)}
                                onRemove={() => {
                                    merge.removeSource(
                                        source.id,
                                        mergeSetup.sourceNames.nameByHandle,
                                    );
                                    setOpenSourceId(PRIMARY_SOURCE_ID);
                                }}
                            />
                        );
                    })}
                    <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                            if (unfinishedSource) {
                                merge.setFocus({
                                    kind: 'source',
                                    sourceId: unfinishedSource.id,
                                });
                                setOpenSourceId(unfinishedSource.id);
                                return;
                            }
                            const id = getNextMergeSourceId(
                                merge.additionalSources,
                            );
                            merge.addSource(id);
                            setOpenSourceId(id);
                            setIsChoosingAdditionalExplore(false);
                        }}
                    >
                        {unfinishedSource
                            ? 'Finish current source'
                            : 'Add data source'}
                    </Button>
                </Box>

                {openSourceId === PRIMARY_SOURCE_ID && (
                    <Box className={styles.body}>
                        <ItemDetailProvider>
                            <ExploreTree
                                explore={primaryExplore}
                                onSelectedFieldChange={onPrimaryFieldChange}
                                hideSelectedFields
                            />
                        </ItemDetailProvider>
                    </Box>
                )}
                {merge.additionalSources
                    .filter((source) => source.id === openSourceId)
                    .map((source) => (
                        <Box className={styles.body} key={source.id}>
                            <MergeSourceTree
                                sourceId={source.id}
                                isChoosingExplore={isChoosingAdditionalExplore}
                                setIsChoosingExplore={
                                    setIsChoosingAdditionalExplore
                                }
                                selectedFields={selectedFields}
                                hideSelectedFields
                            />
                        </Box>
                    ))}
            </Box>
        </Box>
    );
};
