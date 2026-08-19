import { getDefaultZIndex, Text, Tooltip, type TextProps } from '@mantine/core';
import { type FC } from 'react';
import { useIsTruncated } from '../../../hooks/useIsTruncated';

interface TruncatedTextProps extends Omit<TextProps, 'truncate'> {
    children: string;
    maxWidth: number | string;
    /** Render the inner element as <span> instead of <p>. Use when the
     *  TruncatedText is nested inside another block-level text element to
     *  avoid invalid HTML (<p> inside <p>). */
    inline?: boolean;
    /** Caps the tooltip label at this many characters and wraps it, so long
     *  values don't stretch the tooltip across the page. */
    tooltipMaxLength?: number;
}

const TOOLTIP_MAX_WIDTH = 400;

/**
 * Renders text truncated with an ellipsis at the given maxWidth.
 * When the text is actually truncated, hovering shows the full text in a tooltip.
 */
const TruncatedText: FC<TruncatedTextProps> = ({
    children,
    maxWidth,
    inline,
    tooltipMaxLength,
    ...textProps
}) => {
    const { ref, isTruncated } = useIsTruncated<HTMLParagraphElement>();
    const isCapped = tooltipMaxLength !== undefined;
    const label =
        isCapped && children.length > tooltipMaxLength
            ? `${children.slice(0, tooltipMaxLength).trimEnd()}…`
            : children;

    return (
        <Tooltip
            label={label}
            disabled={!isTruncated}
            withinPortal
            multiline={isCapped}
            maw={isCapped ? TOOLTIP_MAX_WIDTH : undefined}
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
