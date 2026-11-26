import { useElementSize } from '@mantine/hooks';
import {
    useEffect,
    useLayoutEffect,
    useReducer,
    useRef,
    useState,
    type FC,
} from 'react';
import {
    Responsive,
    type ResponsiveProps,
    type WidthProviderProps,
} from 'react-grid-layout';
import { CanvasZoom } from './CanvasZoom';
import { getBreakpointForWidth } from './gridUtils';

type Props = Omit<ResponsiveProps, 'width' | 'innerRef'> & WidthProviderProps;

/** Track the grid itself so host-container and sidebar resizes also reflow it. */
export const ResponsiveGridLayout: FC<Props> = ({
    measureBeforeMount = false,
    ...props
}) => {
    const { ref, width: observedWidth } = useElementSize<HTMLDivElement>();
    const [width, setWidth] = useState<number>();
    const { breakpoints, cols, onBreakpointChange } = props;
    const hasReportedInitialBreakpoint = useRef(false);

    // react-grid-layout clamps new layouts to its old cols, so a finer or
    // coarser grid (the widest breakpoint's cols change) goes in first and its
    // layouts one render later, both before paint; other changes pass through
    const committed = useRef({ cols, layouts: props.layouts });
    const [, renderLayouts] = useReducer((n: number) => n + 1, 0);
    const widest = breakpoints
        ? getBreakpointForWidth(breakpoints, Infinity)
        : undefined;
    const isAwaitingCols =
        widest !== undefined &&
        committed.current.cols?.[widest] !== cols?.[widest];
    const layouts = isAwaitingCols ? committed.current.layouts : props.layouts;
    // A hidden tab runs no effects, so its grid misses a cols change and
    // remounts on reveal; this runs on mount and on every reveal
    const [gridKey, remountGrid] = useReducer((n: number) => n + 1, 0);
    const isAwaitingColsRef = useRef(isAwaitingCols);
    isAwaitingColsRef.current = isAwaitingCols;
    useLayoutEffect(() => {
        if (isAwaitingColsRef.current) remountGrid();
    }, []);
    useLayoutEffect(() => {
        committed.current = { cols, layouts: props.layouts };
        if (isAwaitingCols) renderLayouts();
    }, [cols, props.layouts, isAwaitingCols]);

    useEffect(() => {
        // Hidden dashboard tabs can report zero. Keep their last valid layout.
        if (observedWidth > 0) setWidth(observedWidth);
    }, [observedWidth]);

    // react-grid-layout only reports breakpoint *changes*, so a grid that mounts
    // already below `lg` would leave consumers assuming the lg column count.
    useEffect(() => {
        if (
            width === undefined ||
            hasReportedInitialBreakpoint.current ||
            !breakpoints ||
            !cols ||
            !onBreakpointChange
        )
            return;
        hasReportedInitialBreakpoint.current = true;
        const breakpoint = getBreakpointForWidth(breakpoints, width);
        onBreakpointChange(breakpoint, cols[breakpoint]);
    }, [width, breakpoints, cols, onBreakpointChange]);

    if (measureBeforeMount && width === undefined) {
        return (
            <div
                ref={ref}
                className={`react-grid-layout ${props.className ?? ''}`}
                // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                style={props.style}
            />
        );
    }

    const grid = (
        <Responsive
            key={gridKey}
            {...props}
            layouts={layouts}
            innerRef={ref}
            width={width ?? 1280}
        />
    );
    // Grids that never zoom keep their DOM as it was
    return props.transformScale === undefined ? (
        grid
    ) : (
        <CanvasZoom zoom={props.transformScale}>{grid}</CanvasZoom>
    );
};
