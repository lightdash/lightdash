import {
    Box,
    Button,
    Group,
    Paper,
    SegmentedControl,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconDownload,
    IconZoomIn,
    IconZoomReset,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import React, { useRef, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceArea,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import MantineIcon from '../../../../components/common/MantineIcon';

interface DataPoint {
    timestamp: number;
    value: number | null;
    anomaly?: boolean;
}

interface Props {
    data: DataPoint[];
    previousPeriodData?: DataPoint[];
}

type InterpolationType =
    | 'linear'
    | 'monotone'
    | 'step'
    | 'stepBefore'
    | 'stepAfter'
    | 'natural';

type NullInterpolationType = 'none' | 'zero' | 'average';

export const TimeSeriesChart: React.FC<Props> = ({
    data,
    previousPeriodData,
}) => {
    const [zoomState, setZoomState] = useState<{
        refAreaLeft: number | null;
        refAreaRight: number | null;
        data: DataPoint[];
        previousPeriodData?: DataPoint[];
    }>({
        refAreaLeft: null,
        refAreaRight: null,
        data: data,
        previousPeriodData: previousPeriodData,
    });
    const [showComparison, setShowComparison] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const [clickPosition, setClickPosition] = useState<{
        x: number;
        y: number;
        show: boolean;
    }>({
        x: 0,
        y: 0,
        show: false,
    });
    const [activeTooltipData, setActiveTooltipData] = useState<{
        activeLabel: number | null;
        activePayload: any[] | null;
    }>({
        activeLabel: null,
        activePayload: null,
    });
    const [clickedTooltipData, setClickedTooltipData] = useState<{
        label: number | null;
        payload: any[] | null;
    }>({
        label: null,
        payload: null,
    });
    const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(
        null,
    );
    const [interpolationType, setInterpolationType] =
        useState<InterpolationType>('monotone');
    const [connectNulls, setConnectNulls] = useState(false);
    const [showGradient, setShowGradient] = useState(false);
    const [nullInterpolation, setNullInterpolation] =
        useState<NullInterpolationType>('none');

    const getDisplayData = () => {
        let processedData = zoomState.data.map((point) => {
            if (point.value === null) {
                switch (nullInterpolation) {
                    case 'zero':
                        return { ...point, value: 0 };
                    case 'average':
                        const values = zoomState.data
                            .filter((p) => p.value !== null)
                            .map((p) => p.value as number);
                        const avg =
                            values.reduce((a, b) => a + b, 0) / values.length;
                        return { ...point, value: avg };
                    default:
                        return point;
                }
            }
            return point;
        });

        if (!showComparison || !previousPeriodData) {
            return processedData;
        }

        const alignedPreviousData =
            zoomState.previousPeriodData?.map((point) => ({
                ...point,
                timestamp:
                    point.timestamp +
                    (data[0].timestamp - previousPeriodData[0].timestamp),
                value: point.value,
                isPreviousPeriod: true as const,
            })) || [];

        return [...processedData, ...alignedPreviousData];
    };

    const handleZoom = () => {
        if (
            zoomState.refAreaLeft === zoomState.refAreaRight ||
            !zoomState.refAreaRight
        ) {
            setZoomState((prev) => ({
                ...prev,
                refAreaLeft: null,
                refAreaRight: null,
            }));
            return;
        }

        const start = Math.min(zoomState.refAreaLeft!, zoomState.refAreaRight!);
        const end = Math.max(zoomState.refAreaLeft!, zoomState.refAreaRight!);

        const filteredData = data.filter(
            (item) => item.timestamp >= start && item.timestamp <= end,
        );

        let filteredPreviousPeriodData = undefined;
        if (previousPeriodData) {
            const timeDiff =
                data[0].timestamp - previousPeriodData[0].timestamp;
            filteredPreviousPeriodData = previousPeriodData.filter(
                (item) =>
                    item.timestamp + timeDiff >= start &&
                    item.timestamp + timeDiff <= end,
            );
        }

        setZoomState({
            refAreaLeft: null,
            refAreaRight: null,
            data: filteredData,
            previousPeriodData: filteredPreviousPeriodData,
        });
    };

    const resetZoom = () => {
        setZoomState({
            refAreaLeft: null,
            refAreaRight: null,
            data: data,
            previousPeriodData: previousPeriodData,
        });
    };

    const handleScreenshot = async () => {
        if (chartRef.current) {
            const canvas = await html2canvas(chartRef.current);
            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = image;
            link.download = 'chart-screenshot.png';
            link.click();
        }
    };

    const CustomTooltip = ({ active, payload, label, noStyles }: any) => {
        if (active && payload && payload.length) {
            const currentPoint = payload.find(
                (p: any) => !p.payload.isPreviousPeriod,
            );
            const previousPoint = payload.find(
                (p: any) => p.payload.isPreviousPeriod,
            );

            if (!currentPoint && !previousPoint) return null;

            const currentValue = currentPoint?.value;
            const previousValue = previousPoint?.value;

            return (
                <Paper
                    p={!noStyles ? 'sm' : 'none'}
                    shadow={!noStyles ? 'sm' : 'none'}
                    withBorder={!noStyles}
                >
                    <Text size="sm" c="dimmed">
                        {format(new Date(label), 'PPpp')}
                    </Text>
                    <Box>
                        {currentPoint && (
                            <Text size="lg" fw={600}>
                                Current:{' '}
                                {currentValue === null
                                    ? 'No data'
                                    : currentValue?.toFixed(2)}
                                {currentPoint.payload.anomaly && (
                                    <IconAlertCircle
                                        style={{
                                            color: 'red',
                                            width: '1rem',
                                            height: '1rem',
                                        }}
                                    />
                                )}
                            </Text>
                        )}
                        {showComparison && previousPoint && (
                            <>
                                <Text size="sm">
                                    Previous:{' '}
                                    {previousValue === null
                                        ? 'No data'
                                        : previousValue?.toFixed(2)}
                                </Text>
                                <Text
                                    size="sm"
                                    c={
                                        currentValue === null
                                            ? 'dimmed'
                                            : currentValue > previousValue
                                            ? 'green'
                                            : 'red'
                                    }
                                >
                                    Change:{' '}
                                    {currentValue === null ||
                                    previousValue === null ||
                                    !currentPoint
                                        ? 'unavailable'
                                        : `${(
                                              ((currentValue - previousValue) /
                                                  previousValue) *
                                              100
                                          ).toFixed(1)}%`}
                                </Text>
                            </>
                        )}
                    </Box>
                </Paper>
            );
        }
        return null;
    };

    return (
        <Paper h={500} ref={chartRef}>
            <Group position="right" spacing="xs" mb="xs">
                {previousPeriodData && (
                    <Button
                        variant="light"
                        onClick={() => setShowComparison(!showComparison)}
                        size="xs"
                        color="teal"
                    >
                        {showComparison ? 'Hide' : 'Show'} Previous Period
                    </Button>
                )}
                <Button
                    variant="light"
                    onClick={handleScreenshot}
                    size="xs"
                    color="grape"
                    leftIcon={<MantineIcon icon={IconDownload} />}
                >
                    Screenshot
                </Button>
                <Button
                    variant="light"
                    onClick={resetZoom}
                    size="xs"
                    color="indigo"
                    leftIcon={<MantineIcon icon={IconZoomReset} />}
                >
                    Reset Zoom
                </Button>
            </Group>

            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={getDisplayData()}
                    onMouseDown={(e) =>
                        e?.activeLabel &&
                        setZoomState((prev) => ({
                            ...prev,
                            refAreaLeft: Number(e.activeLabel),
                        }))
                    }
                    onMouseMove={(e) => {
                        if (zoomState.refAreaLeft && e?.activeLabel) {
                            setZoomState((prev) => ({
                                ...prev,
                                refAreaRight: Number(e.activeLabel),
                            }));
                        }
                        if (e?.activeLabel && e?.activePayload) {
                            setActiveTooltipData({
                                activeLabel: Number(e.activeLabel),
                                activePayload: e.activePayload,
                            });
                        }
                    }}
                    onMouseLeave={() => {
                        if (!clickPosition.show) {
                            setActiveTooltipData({
                                activeLabel: null,
                                activePayload: null,
                            });
                        }
                    }}
                    onMouseUp={handleZoom}
                    onClick={(d, e) => {
                        if (e?.nativeEvent && activeTooltipData.activePayload) {
                            if (
                                activeTooltipData.activeLabel ===
                                selectedTimestamp
                            ) {
                                setClickPosition((prev) => ({
                                    ...prev,
                                    show: false,
                                }));
                                setSelectedTimestamp(null);
                                return;
                            }

                            if (clickPosition.show) {
                                setClickPosition((prev) => ({
                                    ...prev,
                                    show: false,
                                }));
                                setSelectedTimestamp(null);
                                return;
                            }

                            setClickPosition({
                                x: e.nativeEvent.clientX,
                                y: e.nativeEvent.clientY,
                                show: true,
                            });
                            setClickedTooltipData({
                                label: activeTooltipData.activeLabel,
                                payload: activeTooltipData.activePayload,
                            });
                            setSelectedTimestamp(activeTooltipData.activeLabel);
                        } else {
                            setClickPosition((prev) => ({
                                ...prev,
                                show: false,
                            }));
                            setSelectedTimestamp(null);
                        }
                    }}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        className="opacity-30"
                    />
                    <XAxis
                        dataKey="timestamp"
                        type="number"
                        scale="time"
                        domain={['auto', 'auto']}
                        tickFormatter={(timestamp) =>
                            format(new Date(timestamp), 'MMM d, HH:mm')
                        }
                    />
                    <YAxis />
                    <Tooltip
                        content={<CustomTooltip />}
                        isAnimationActive={false}
                    />
                    <defs>
                        <linearGradient
                            id="colorValue"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="5%"
                                stopColor="#6366f1"
                                stopOpacity={0.3}
                            />
                            <stop
                                offset="95%"
                                stopColor="#6366f1"
                                stopOpacity={0}
                            />
                        </linearGradient>
                    </defs>
                    <Area
                        type={interpolationType}
                        dataKey="value"
                        stroke="#6366f1"
                        fillOpacity={showGradient ? 1 : 0}
                        fill="url(#colorValue)"
                        connectNulls={connectNulls}
                        strokeWidth={2}
                        name="Current"
                        data={zoomState.data}
                    />
                    {zoomState.refAreaLeft && zoomState.refAreaRight && (
                        <ReferenceArea
                            x1={zoomState.refAreaLeft}
                            x2={zoomState.refAreaRight}
                            strokeOpacity={0.3}
                            fill="#6366f1"
                            fillOpacity={0.1}
                        />
                    )}
                    {showComparison && previousPeriodData && (
                        <Area
                            type={interpolationType}
                            dataKey="value"
                            stroke="#14b8a6"
                            fill="none"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            name="Previous"
                            data={zoomState.previousPeriodData?.map(
                                (point) => ({
                                    ...point,
                                    timestamp:
                                        point.timestamp +
                                        (data[0].timestamp -
                                            previousPeriodData[0].timestamp),
                                    value: point.value,
                                    isPreviousPeriod: true as const,
                                }),
                            )}
                            connectNulls={connectNulls}
                        />
                    )}
                    {selectedTimestamp && (
                        <ReferenceLine
                            x={selectedTimestamp}
                            stroke="#f472b6" // neon pink
                            strokeWidth={2}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>

            <Group position="left" mt="sm" spacing="lg">
                <Select
                    size="xs"
                    label="Interpolation"
                    value={interpolationType}
                    onChange={(value) =>
                        setInterpolationType(value as InterpolationType)
                    }
                    data={[
                        { value: 'linear', label: 'Linear' },
                        { value: 'monotone', label: 'Monotone' },
                        { value: 'step', label: 'Step (middle)' },
                        { value: 'stepBefore', label: 'Step (before)' },
                        { value: 'stepAfter', label: 'Step (after)' },
                        { value: 'natural', label: 'Natural' },
                    ]}
                    w={200}
                />
                <SegmentedControl
                    size="xs"
                    value={connectNulls ? 'connect' : 'break'}
                    onChange={(value) => setConnectNulls(value === 'connect')}
                    data={[
                        { label: 'Break on null', value: 'break' },
                        { label: 'Connect nulls', value: 'connect' },
                    ]}
                />
                <SegmentedControl
                    size="xs"
                    value={showGradient ? 'gradient' : 'line'}
                    onChange={(value) => setShowGradient(value === 'gradient')}
                    data={[
                        { label: 'Line only', value: 'line' },
                        { label: 'With gradient', value: 'gradient' },
                    ]}
                />
                <Select
                    size="xs"
                    label="Null Values"
                    value={nullInterpolation}
                    onChange={(value) =>
                        setNullInterpolation(value as NullInterpolationType)
                    }
                    data={[
                        { value: 'none', label: 'Show gaps' },
                        { value: 'zero', label: 'Show as zero' },
                        { value: 'average', label: 'Show as average' },
                    ]}
                    w={200}
                />
            </Group>

            {clickPosition.show && clickedTooltipData.payload && (
                <Paper
                    style={{
                        position: 'fixed',
                        left: clickPosition.x - 50,
                        bottom: clickPosition.y + 10,
                        top: clickPosition.y + 10,
                        background: 'white',
                        padding: '10px',
                        borderRadius: '4px',
                        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
                        width: '200px',
                        height: '150px',
                        pointerEvents: 'none',
                    }}
                >
                    <Stack>
                        <Text fw={600}>Let's see the data point</Text>
                        <CustomTooltip
                            active={true}
                            payload={clickedTooltipData.payload}
                            label={clickedTooltipData.label}
                            noStyles
                        />
                        <Group position="apart" noWrap>
                            <Button
                                size="xs"
                                variant="light"
                                onClick={() => {
                                    setClickPosition((prev) => ({
                                        ...prev,
                                        show: false,
                                    }));
                                    setSelectedTimestamp(null);
                                }}
                                style={{ pointerEvents: 'auto' }}
                            >
                                Close
                            </Button>
                            <Button
                                size="xs"
                                variant="light"
                                color="orange"
                                leftIcon={<MantineIcon icon={IconZoomIn} />}
                            >
                                Drill down
                            </Button>
                        </Group>
                    </Stack>
                </Paper>
            )}
        </Paper>
    );
};
