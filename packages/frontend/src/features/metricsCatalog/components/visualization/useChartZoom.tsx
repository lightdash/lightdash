import type { MetricExploreDataPoint } from '@lightdash/common';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { type CategoricalChartFunc } from 'recharts/types/chart/generateCategoricalChart';

type UseChartZoomArgs<T extends MetricExploreDataPoint> = {
    data: T[];
};

type ChartZoom<T extends MetricExploreDataPoint> = {
    zoomState: ZoomState<T>;
    handlers: {
        handleMouseDown: CategoricalChartFunc;
        handleMouseMove: CategoricalChartFunc;
        handleMouseUp: CategoricalChartFunc;
        resetZoom: () => void;
    };
    activeData: T[];
};

type ZoomState<T extends MetricExploreDataPoint> = {
    refAreaLeft: number | null;
    refAreaRight: number | null;
    zoomedData: T[] | null;
};

/**
 * Hook to handle zooming on the chart using the recharts library
 * It allows to zoom on the chart by clicking and dragging on the chart
 * @param data - The data to zoom on
 * @returns The zoom state and handlers
 */

export const useChartZoom = <T extends MetricExploreDataPoint>({
    data,
}: UseChartZoomArgs<T>): ChartZoom<T> => {
    const [zoomState, setZoomState] = useState<ZoomState<T>>({
        refAreaLeft: null,
        refAreaRight: null,
        zoomedData: null,
    });

    const resetZoom = useCallback(() => {
        setZoomState({
            refAreaLeft: null,
            refAreaRight: null,
            zoomedData: null,
        });
    }, []);

    const resetZoomRefs = useCallback(() => {
        setZoomState((prev) => ({
            ...prev,
            refAreaLeft: null,
            refAreaRight: null,
        }));
    }, []);

    const handleMouseDown: CategoricalChartFunc = useCallback((e) => {
        if (!e) return;
        const value = e.activeLabel?.valueOf();

        if (typeof value === 'number') {
            setZoomState((prev) => ({
                ...prev,
                refAreaLeft: value,
            }));
        }
    }, []);

    const handleMouseMove: CategoricalChartFunc = useCallback(
        (e) => {
            if (!e || !zoomState.refAreaLeft) return;
            const value = e.activeLabel?.valueOf();

            if (typeof value === 'number') {
                setZoomState((prev) => ({
                    ...prev,
                    refAreaRight: value,
                }));
            }
        },
        [zoomState.refAreaLeft],
    );

    const handleMouseUp: CategoricalChartFunc = useCallback(() => {
        if (!zoomState.refAreaLeft || !zoomState.refAreaRight) {
            // Reset refs but keep zoomed in data, this is so that the chart is not reset
            resetZoomRefs();
            return;
        }

        const start = Math.min(zoomState.refAreaLeft, zoomState.refAreaRight);
        const end = Math.max(zoomState.refAreaLeft, zoomState.refAreaRight);
        const startEndDelta = end - start;

        if (startEndDelta === 0) {
            // Reset refs but keep zoomed in data, this is so that the chart is not reset
            resetZoomRefs();
            return;
        }

        const filteredData = data.filter((item) => {
            const itemDate = dayjs(item.date);

            return (
                (itemDate.isAfter(dayjs(start)) &&
                    itemDate.isBefore(dayjs(end))) ||
                itemDate.isSame(dayjs(start)) ||
                itemDate.isSame(dayjs(end))
            );
        });

        setZoomState({
            refAreaLeft: null,
            refAreaRight: null,
            zoomedData: filteredData,
        });
    }, [data, zoomState, resetZoomRefs]);

    const handlers = useMemo(
        () => ({
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            resetZoom,
        }),
        [handleMouseDown, handleMouseMove, handleMouseUp, resetZoom],
    );

    const result = useMemo(
        () => ({
            zoomState,
            handlers,
            activeData: zoomState.zoomedData ?? data,
        }),
        [zoomState, handlers, data],
    );

    return result;
};
