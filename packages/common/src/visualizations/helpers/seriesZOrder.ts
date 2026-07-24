export const SERIES_Z_BASE = 2;
// Matches the ECharts markLine default; pinned explicitly so persisted config
// can't sink reference lines below the series band.
export const REFERENCE_LINE_Z = 5;

type ZOrderableSeries = {
    z?: number;
    markLine?: Record<string, unknown>;
};

// Paint order from series-list position: earlier in the list paints behind.
export const assignSeriesZByOrder = <T extends ZOrderableSeries>(
    series: T[],
): T[] =>
    series.map((serie, index) => ({
        ...serie,
        z: SERIES_Z_BASE + index / series.length,
        ...(serie.markLine
            ? { markLine: { ...serie.markLine, z: REFERENCE_LINE_Z } }
            : {}),
    }));
