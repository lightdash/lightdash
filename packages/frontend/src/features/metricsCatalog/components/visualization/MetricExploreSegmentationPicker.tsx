import {
    MAX_SEGMENT_DIMENSION_UNIQUE_VALUES,
    MetricExplorerComparison,
    type MetricExplorerQuery,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconX } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { Blocks } from '../../../../svgs/metricsCatalog';
import { useSelectStyles } from '../../styles/useSelectStyles';
import SelectItem from '../SelectItem';

type Props = {
    query: MetricExplorerQuery;
    onSegmentDimensionChange: (value: string | null) => void;
    segmentByData: Array<{
        value: string;
        label: string;
        group: string;
    }>;
    segmentDimensionsQuery: UseQueryResult;
    hasFilteredSeries: boolean;
};

export const MetricExploreSegmentationPicker: FC<Props> = ({
    query,
    onSegmentDimensionChange,
    segmentByData,
    segmentDimensionsQuery,
    hasFilteredSeries,
}) => {
    const { classes } = useSelectStyles();

    return (
        <Stack spacing="xs">
            <Group position="apart">
                <Text fw={500} c="ldGray.7">
                    Segment
                </Text>

                <Button
                    variant="subtle"
                    compact
                    color="dark"
                    size="xs"
                    radius="md"
                    rightIcon={
                        <MantineIcon icon={IconX} color="ldGray.5" size={12} />
                    }
                    sx={(theme) => ({
                        visibility:
                            !('segmentDimension' in query) ||
                            !query.segmentDimension
                                ? 'hidden'
                                : 'visible',
                        '&:hover': {
                            backgroundColor: theme.colors.ldGray[1],
                        },
                    })}
                    styles={{
                        rightIcon: {
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
                        placeholder="Segment by"
                        icon={<Blocks />}
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
                        itemComponent={SelectItem}
                        onChange={onSegmentDimensionChange}
                        data-disabled={!segmentDimensionsQuery.isSuccess}
                        rightSection={
                            segmentDimensionsQuery.isLoading ? (
                                <Loader size="xs" color="ldGray.5" />
                            ) : undefined
                        }
                        classNames={classes}
                        sx={{
                            '&:hover': {
                                cursor: 'not-allowed',
                            },
                        }}
                    />
                </Box>
            </Tooltip>

            {hasFilteredSeries && (
                <Alert
                    py="xs"
                    px="sm"
                    variant="light"
                    color="blue"
                    sx={(theme) => ({
                        borderStyle: 'dashed',
                        borderWidth: 1,
                        borderColor: theme.colors.blue[4],
                    })}
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
                    <Text size="xs" color="blue.7" span>
                        Only the first {MAX_SEGMENT_DIMENSION_UNIQUE_VALUES}{' '}
                        series are displayed to maintain a clear and readable
                        chart.
                    </Text>
                </Alert>
            )}
        </Stack>
    );
};
