import {
    getDefaultZIndex,
    Text,
    Tooltip,
    type TextProps,
} from '@mantine-8/core';
import { type FC } from 'react';
import { useIsTruncated } from '../../../hooks/useIsTruncated';

interface TruncatedTextProps extends Omit<TextProps, 'truncate'> {
    children: string;
    maxWidth: number | string;
    /** Render the inner element as <span> instead of <p>. Use when the
     *  TruncatedText is nested inside another block-level text element to
     *  avoid invalid HTML (<p> inside <p>). */
    inline?: boolean;
}

/**
 * Renders text truncated with an ellipsis at the given maxWidth.
 * When the text is actually truncated, hovering shows the full text in a tooltip.
 */
const TruncatedText: FC<TruncatedTextProps> = ({
    children,
    maxWidth,
    inline,
    ...textProps
}) => {
    const { ref, isTruncated } = useIsTruncated<HTMLParagraphElement>();

    return (
        <Tooltip
            label={children}
            disabled={!isTruncated}
            withinPortal
            zIndex={getDefaultZIndex('max')}
        >
            <Text
                ref={ref}
                fz="sm"
                truncate="end"
                maw={maxWidth}
                span={inline}
                {...textProps}
            >
                {children}
            </Text>
        </Tooltip>
    );
};

export default TruncatedText;
