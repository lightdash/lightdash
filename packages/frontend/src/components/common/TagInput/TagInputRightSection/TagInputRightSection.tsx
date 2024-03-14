import { CloseButton } from '@mantine/core';
import { type MantineSize } from '@mantine/styles';
import React from 'react';

export interface TagInputRightSectionProps {
    shouldClear: boolean;
    clearButtonProps?: React.ComponentPropsWithoutRef<'button'>;
    onClear?: () => void;
    size: MantineSize;
    error?: any;
    // eslint-disable-next-line react/no-unused-prop-types
    disabled?: boolean;
}

export function TagInputRightSection({
    shouldClear,
    clearButtonProps,
    onClear,
    size,
}: TagInputRightSectionProps) {
    return shouldClear ? (
        <CloseButton
            {...clearButtonProps}
            variant="transparent"
            onClick={onClear}
            size={size}
            onMouseDown={(event) => event.preventDefault()}
        />
    ) : (
        <></>
    );
}

TagInputRightSection.displayName = '@mantine/core/TagInputRightSection';
