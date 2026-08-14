import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isMetric,
    type Explore,
} from '@lightdash/common';
import { ActionIcon, Box, Text, UnstyledButton } from '@mantine/core';
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
import { selectMetricQuery, useExplorerSelector } from '../../explorer/store';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMerge } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import styles from './MergeQuerySidebar.module.css';
import { MergeSourceTree } from './MergeSourceTree';

type SourceRole = 'primary' | 'additional';

const DatasetHeader: FC<{
    sourceRole: SourceRole;
    label: string;
    count: number;
    open: boolean;
    onClick: () => void;
    onRemove?: () => void;
}> = ({ sourceRole, label, count, open, onClick, onRemove }) => (
    <Box className={styles.header} data-open={open}>
        <UnstyledButton className={styles.headerButton} onClick={onClick}>
            <Box
                className={styles.dot}
                data-side={sourceRole === 'primary' ? 'a' : 'b'}
            />
            <Box className={styles.headerCopy}>
                <Text size="sm" fw={600} truncate title={label}>
                    {label}
                </Text>
                <Text size="xs" c="dimmed">
                    {count === 0
                        ? sourceRole === 'additional'
                            ? 'Select data and fields'
                            : 'Choose fields'
                        : `${count} selected`}
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
                variant="subtle"
                color="gray"
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
    const additionalSource = merge.additionalSources[0];
    const additionalSourceId = additionalSource?.id;
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const mergeSetup = useMergeSetup();
    const [openSourceId, setOpenSourceId] = useState<string | null>(
        merge.focus.kind === 'source' ? merge.focus.sourceId : null,
    );

    useEffect(() => {
        if (additionalSourceId && !additionalSource?.exploreName) {
            setOpenSourceId(additionalSourceId);
        }
    }, [additionalSource?.exploreName, additionalSourceId]);

    const toggle = (sourceId: string) => {
        setOpenSourceId((current) => (current === sourceId ? null : sourceId));
        if (openSourceId !== sourceId) {
            merge.setFocus({ kind: 'source', sourceId });
        }
    };
    const primaryCount =
        metricQuery.dimensions.length + metricQuery.metrics.length;
    const additionalCount =
        (additionalSource?.dimensions.length ?? 0) +
        (additionalSource?.metrics.length ?? 0);
    const additionalLabel = additionalSource?.exploreName
        ? (mergeSetup.additionalExploreLabel ?? 'Combined data')
        : 'Choose data to combine';
    const selectedFields = useMemo<SelectedField[]>(() => {
        const primaryLabel = mergeSetup.primaryExploreLabel ?? 'First data';
        const additionalSourceLabel =
            mergeSetup.additionalExploreLabel ?? 'Combined data';
        const sameLabel = primaryLabel === additionalSourceLabel;
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
                    hideActions: true,
                },
            ];
        });
        const selectedAdditional = [
            ...(additionalSource?.dimensions ?? []),
            ...(additionalSource?.metrics ?? []),
        ].flatMap((fieldId) => {
            const item = mergeSetup.additionalItemMap[fieldId];
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
                    tableLabel: sameLabel
                        ? `${additionalSourceLabel} · Second`
                        : additionalSourceLabel,
                    isDimension:
                        additionalSource?.dimensions.includes(fieldId) ?? false,
                    onDeselect: (id: string, isDimension: boolean) =>
                        additionalSourceId &&
                        merge.toggleSourceField(
                            additionalSourceId,
                            id,
                            isDimension,
                        ),
                    hideActions: true,
                },
            ];
        });

        return [...selectedPrimary, ...selectedAdditional];
    }, [
        additionalSource,
        additionalSourceId,
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
                <Text className={styles.sourcesLabel}>Data sources</Text>
                <Box className={styles.sourceList}>
                    <DatasetHeader
                        sourceRole="primary"
                        label={
                            mergeSetup.primaryExploreLabel ??
                            primaryExplore.label
                        }
                        count={primaryCount}
                        open={openSourceId === PRIMARY_SOURCE_ID}
                        onClick={() => toggle(PRIMARY_SOURCE_ID)}
                    />
                    {additionalSourceId && (
                        <DatasetHeader
                            sourceRole="additional"
                            label={additionalLabel}
                            count={additionalCount}
                            open={openSourceId === additionalSourceId}
                            onClick={() => toggle(additionalSourceId)}
                            onRemove={() =>
                                merge.removeSource(additionalSourceId)
                            }
                        />
                    )}
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
                {additionalSourceId && openSourceId === additionalSourceId && (
                    <Box className={styles.body}>
                        <MergeSourceTree
                            sourceId={additionalSourceId}
                            isChoosingExplore={isChoosingAdditionalExplore}
                            setIsChoosingExplore={
                                setIsChoosingAdditionalExplore
                            }
                            selectedFields={selectedFields}
                            hideSelectedFields
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
};
