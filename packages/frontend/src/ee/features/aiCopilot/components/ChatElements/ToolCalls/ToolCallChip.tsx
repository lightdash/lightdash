import { Badge, rem, type BadgeProps } from '@mantine-8/core';
import type { FC, ReactNode } from 'react';
import TruncatedText from '../../../../../../components/common/TruncatedText';

type ToolCallChipProps = Omit<BadgeProps, 'children' | 'maw'> & {
    children: ReactNode;
    /**
     * Max width for the chip's truncating label. Long values ellipsize and
     * the full value appears on hover via TruncatedText's tooltip.
     */
    maxWidth?: number | string;
};

/**
 * Shared chip for tool-call descriptions and traces.
 *
 * Locks color/variant/size/radius/textTransform/fontWeight so every chip
 * across the activity card looks identical. String children are wrapped in
 * TruncatedText so long names (fieldIds, search queries) ellipsize with a
 * hover tooltip rather than expanding the chip indefinitely.
 *
 * Pass `mx` etc. for layout differences between inline-text and grouped
 * callers.
 */
export const ToolCallChip: FC<ToolCallChipProps> = ({
    children,
    maxWidth = rem(220),
    style,
    ...rest
}) => (
    <Badge
        color="gray"
        variant="light"
        size="xs"
        radius="sm"
        maw={maxWidth}
        {...rest}
        style={{
            textTransform: 'none',
            fontWeight: 400,
            ...(typeof style === 'object' && style !== null ? style : {}),
        }}
    >
        {typeof children === 'string' ? (
            <TruncatedText
                maxWidth={maxWidth}
                fz="inherit"
                c="inherit"
                style={{ lineHeight: 'inherit' }}
            >
                {children}
            </TruncatedText>
        ) : (
            children
        )}
    </Badge>
);
