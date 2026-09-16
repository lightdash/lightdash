import { useElementSize } from '@mantine/hooks';
import { useEffect, useState, type FC } from 'react';
import {
    Responsive,
    type ResponsiveProps,
    type WidthProviderProps,
} from 'react-grid-layout';

type Props = Omit<ResponsiveProps, 'width' | 'innerRef'> & WidthProviderProps;

/** Track the grid itself so host-container and sidebar resizes also reflow it. */
export const ResponsiveGridLayout: FC<Props> = ({
    measureBeforeMount = false,
    ...props
}) => {
    const { ref, width: observedWidth } = useElementSize<HTMLDivElement>();
    const [width, setWidth] = useState<number>();

    useEffect(() => {
        // Hidden dashboard tabs can report zero. Keep their last valid layout.
        if (observedWidth > 0) setWidth(observedWidth);
    }, [observedWidth]);

    if (measureBeforeMount && width === undefined) {
        return (
            <div
                ref={ref}
                className={`react-grid-layout ${props.className ?? ''}`}
                style={props.style}
            />
        );
    }

    return <Responsive {...props} innerRef={ref} width={width ?? 1280} />;
};
