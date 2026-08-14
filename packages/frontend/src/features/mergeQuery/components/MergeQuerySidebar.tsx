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
import { useMerge } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import styles from './MergeQuerySidebar.module.css';
import { QueryBTree } from './QueryBTree';

type Side = 'a' | 'b';

const DatasetHeader: FC<{
    side: Side;
    label: string;
    count: number;
    open: boolean;
    onClick: () => void;
    onRemove?: () => void;
}> = ({ side, label, count, open, onClick, onRemove }) => (
    <Box className={styles.header} data-open={open}>
        <UnstyledButton className={styles.headerButton} onClick={onClick}>
            <Box className={styles.dot} data-side={side} />
            <Box className={styles.headerCopy}>
                <Text size="sm" fw={600} truncate title={label}>
                    {label}
                </Text>
                <Text size="xs" c="dimmed">
                    {count === 0
                        ? side === 'b'
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
    exploreA: Explore;
    onFieldChangeA: (fieldId: string, isDimension: boolean) => void;
    isChoosingExploreB: boolean;
    setIsChoosingExploreB: Dispatch<SetStateAction<boolean>>;
}> = ({
    exploreA,
    onFieldChangeA,
    isChoosingExploreB,
    setIsChoosingExploreB,
}) => {
    const merge = useMerge();
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const mergeSetup = useMergeSetup();
    const [openSide, setOpenSide] = useState<Side | null>(
        merge.focus === 'b' ? 'b' : 'a',
    );

    useEffect(() => {
        if (!merge.queryB.exploreName) setOpenSide('b');
    }, [merge.queryB.exploreName]);

    const toggle = (side: Side) => {
        setOpenSide((current) => (current === side ? null : side));
        if (openSide !== side) merge.setFocus(side);
    };
    const countA = metricQuery.dimensions.length + metricQuery.metrics.length;
    const countB = merge.queryB.dimensions.length + merge.queryB.metrics.length;
    const labelB = merge.queryB.exploreName
        ? (mergeSetup.exploreBLabel ?? 'Combined data')
        : 'Choose data to combine';
    const selectedFields = useMemo<SelectedField[]>(() => {
        const labelA = mergeSetup.exploreALabel ?? 'First data';
        const sourceBLabel = mergeSetup.exploreBLabel ?? 'Combined data';
        const sameLabel = labelA === sourceBLabel;
        const selectedA = [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
        ].flatMap((fieldId) => {
            const item = mergeSetup.itemMapA[fieldId];
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
                    selectionKey: `a:${fieldId}`,
                    item,
                    tableLabel: sameLabel ? `${labelA} · First` : labelA,
                    isDimension: metricQuery.dimensions.includes(fieldId),
                    onDeselect: onFieldChangeA,
                    hideActions: true,
                },
            ];
        });
        const selectedB = [
            ...merge.queryB.dimensions,
            ...merge.queryB.metrics,
        ].flatMap((fieldId) => {
            const item = mergeSetup.itemMapB[fieldId];
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
                    selectionKey: `b:${fieldId}`,
                    item,
                    tableLabel: sameLabel
                        ? `${sourceBLabel} · Second`
                        : sourceBLabel,
                    isDimension: merge.queryB.dimensions.includes(fieldId),
                    onDeselect: merge.toggleFieldB,
                    hideActions: true,
                },
            ];
        });

        return [...selectedA, ...selectedB];
    }, [merge, mergeSetup, metricQuery, onFieldChangeA]);

    return (
        <Box className={styles.root}>
            <SelectedFieldsSection
                fields={selectedFields}
                onDeselect={onFieldChangeA}
                heading={`Selected for result · ${selectedFields.length}`}
                showAllFieldsDivider={false}
            />

            <Box className={styles.datasets}>
                <Text className={styles.sourcesLabel}>Data sources</Text>
                <Box className={styles.sourceList}>
                    <DatasetHeader
                        side="a"
                        label={mergeSetup.exploreALabel ?? exploreA.label}
                        count={countA}
                        open={openSide === 'a'}
                        onClick={() => toggle('a')}
                    />
                    <DatasetHeader
                        side="b"
                        label={labelB}
                        count={countB}
                        open={openSide === 'b'}
                        onClick={() => toggle('b')}
                        onRemove={merge.removeQuery}
                    />
                </Box>

                {openSide === 'a' && (
                    <Box className={styles.body}>
                        <ItemDetailProvider>
                            <ExploreTree
                                explore={exploreA}
                                onSelectedFieldChange={onFieldChangeA}
                                hideSelectedFields
                            />
                        </ItemDetailProvider>
                    </Box>
                )}
                {openSide === 'b' && (
                    <Box className={styles.body}>
                        <QueryBTree
                            isChoosingExplore={isChoosingExploreB}
                            setIsChoosingExplore={setIsChoosingExploreB}
                            selectedFields={selectedFields}
                            hideSelectedFields
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
};
