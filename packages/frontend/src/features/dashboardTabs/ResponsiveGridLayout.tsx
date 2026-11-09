import { useElementSize } from '@mantine/hooks';
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import {
    ResponsiveGridLayout as Responsive,
    type ResponsiveGridLayoutProps,
} from 'react-grid-layout';
import { getBreakpointForWidth } from './gridUtils';

type Props = Omit<
    ResponsiveGridLayoutProps,
    'width' | 'innerRef' | 'children'
> & {
    children?: ReactNode;
    measureBeforeMount?: boolean;
};

/** Track the grid itself so host-container and sidebar resizes also reflow it. */
export const ResponsiveGridLayout: FC<Props> = ({
    measureBeforeMount = false,
    children,
    ...props
}) => {
    const { ref, width: observedWidth } = useElementSize<HTMLDivElement>();
    const [width, setWidth] = useState<number>();
    const { breakpoints, cols, onBreakpointChange } = props;
    const hasReportedInitialBreakpoint = useRef(false);

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

    return (
        <Responsive {...props} innerRef={ref} width={width ?? 1280}>
            {children}
        </Responsive>
    );
};
