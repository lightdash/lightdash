import { useCallback, useState } from 'react';
import { type CategoricalChartFunc } from 'recharts/types/chart/generateCategoricalChart';
import { type TimeSeriesData } from './types';

interface ZoomState {
    refAreaLeft: number | null;
    refAreaRight: number | null;
    zoomedData: TimeSeriesData[] | null;
}

interface UseChartZoomProps {
    data: TimeSeriesData[];
}

interface ChartZoom {
    zoomState: ZoomState;
    handlers: {
        handleMouseDown: CategoricalChartFunc;
        handleMouseMove: CategoricalChartFunc;
        handleMouseUp: CategoricalChartFunc;
        resetZoom: () => void;
    };
    activeData: TimeSeriesData[];
}

/**
 * Hook to handle zooming on the chart using the recharts library
 * It allows to zoom on the chart by clicking and dragging on the chart
 * @param data - The data to zoom on
 * @returns The zoom state and handlers
 */
export const useChartZoom = ({ data }: UseChartZoomProps): ChartZoom => {
    const [zoomState, setZoomState] = useState<ZoomState>({
        refAreaLeft: null,
        refAreaRight: null,
        zoomedData: null,
    });

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
        if (!zoomState.refAreaLeft || !zoomState.refAreaRight) return;

        const start = Math.min(zoomState.refAreaLeft, zoomState.refAreaRight);
        const end = Math.max(zoomState.refAreaLeft, zoomState.refAreaRight);

        const filteredData = data.filter(
            (item) =>
                item.date.valueOf() >= start && item.date.valueOf() <= end,
        );

        setZoomState({
            refAreaLeft: null,
            refAreaRight: null,
            zoomedData: filteredData,
        });
    }, [data, zoomState.refAreaLeft, zoomState.refAreaRight]);

    const resetZoom = () => {
        setZoomState({
            refAreaLeft: null,
            refAreaRight: null,
            zoomedData: null,
        });
    };

    return {
        zoomState,
        handlers: {
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            resetZoom,
        },
        activeData: zoomState.zoomedData || data,
    };
};
