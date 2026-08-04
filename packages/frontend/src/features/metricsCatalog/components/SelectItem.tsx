import { Box, Text } from '@mantine/core';
import { mergeRefs, useHover } from '@mantine/hooks';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

const SelectItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: string;
        label: string;
        selected: boolean;
    }
>(({ value, label, ...others }, ref) => {
    const { hovered, ref: hoverRef } = useHover();
    return (
        <Box ref={mergeRefs(ref, hoverRef)} {...others} w={290}>
            <Text
                fz="sm"
                c="foreground"
                fw={400}
                truncate={hovered ? undefined : 'end'}
            >
                {label}
            </Text>
        </Box>
    );
});

export default SelectItem;
