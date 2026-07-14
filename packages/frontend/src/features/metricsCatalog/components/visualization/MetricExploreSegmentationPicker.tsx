import {
    getItemId,
    MAX_SEGMENT_DIMENSION_UNIQUE_VALUES,
    MetricExplorerComparison,
    type CompiledDimension,
    type MetricExplorerQuery,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    Select,
} from '@mantine-8/core';
import { Tooltip } from '@mantine/core';
import { IconInfoCircle, IconX } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { groupComboboxItems } from '../../../../components/common/Select/utils';
import { Blocks } from '../../../../svgs/metricsCatalog';
import { useSelectStyles } from '../../styles/useSelectStyles';
import SelectItem from '../SelectItem';
import styles from './MetricExploreButtons.module.css';

type Props = {
    query: MetricExplorerQuery;
    onSegmentDimensionChange: (value: string | null) => void;
    dimensions: CompiledDimension[] | undefined;
    segmentDimensionsQuery: UseQueryResult;
    hasFilteredSeries: boolean;
};

export const MetricExploreSegmentationPicker: FC<Props> = ({
    query,
    onSegmentDimensionChange,
    dimensions,
    segmentDimensionsQuery,
    hasFilteredSeries,
}) => {
    const { classes } = useSelectStyles();

    const segmentByData = useMemo(
        () =>
            groupComboboxItems(
                dimensions?.map((dimension) => ({
                    value: getItemId(dimension),
                    label: dimension.label,
                    group: dimension.tableLabel,
                })) ?? [],
            ),
        [dimensions],
    );

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Text fw={500} c="ldGray.7">
                    Segment
                </Text>

                <Button
                    variant="subtle"
                    size="compact-xs"
                    color="dark"
                    radius="md"
                    rightSection={
                        <MantineIcon icon={IconX} color="ldGray.5" size={12} />
                    }
                    className={styles.clearButton}
                    style={{
                        visibility:
                            !('segmentDimension' in query) ||
                            !query.segmentDimension
                                ? 'hidden'
                                : 'visible',
                    }}
                    styles={{
                        section: {
                            marginLeft: 4,
                        },
                    }}
                    onClick={() => onSegmentDimensionChange(null)}
                >
                    Clear
                </Button>
            </Group>

            <Tooltip
                label="There are no available fields to segment this metric by"
                disabled={segmentByData.length > 0}
                position="right"
            >
                <Box>
                    <Select
                        allowDeselect={false}
                        placeholder="Segment by"
                        leftSection={<Blocks />}
                        searchable
                        radius="md"
                        size="xs"
                        data={segmentByData}
                        disabled={segmentByData.length === 0}
                        value={
                            query.comparison === MetricExplorerComparison.NONE
                                ? query.segmentDimension
                                : null
                        }
                        renderOption={({ option, checked }) => (
                            <SelectItem
                                value={option.value}
                                label={option.label}
                                selected={checked ?? false}
                            />
                        )}
                        onChange={onSegmentDimensionChange}
                        data-disabled={!segmentDimensionsQuery.isSuccess}
                        rightSection={
                            segmentDimensionsQuery.isLoading ? (
                                <Loader size="xs" color="ldGray.5" />
                            ) : undefined
                        }
                        classNames={classes}
                        className={styles.segmentationSelect}
                    />
                </Box>
            </Tooltip>

            {hasFilteredSeries && (
                <Alert
                    py="xs"
                    px="sm"
                    variant="light"
                    color="blue"
                    style={{
                        border: '1px dashed var(--mantine-color-blue-4)',
                    }}
                    styles={{
                        icon: {
                            marginRight: 2,
                        },
                    }}
                    icon={
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="blue.7"
                            size={16}
                        />
                    }
                >
                    <Text size="xs" c="blue.7" span>
                        Only the first {MAX_SEGMENT_DIMENSION_UNIQUE_VALUES}{' '}
                        series are displayed to maintain a clear and readable
                        chart.
                    </Text>
                </Alert>
            )}
        </Stack>
    );
};
