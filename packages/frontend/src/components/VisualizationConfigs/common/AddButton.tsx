import { Button, type ButtonProps } from '@mantine-8/core';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Props = ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const AddButton = forwardRef<HTMLButtonElement, Props>((props, ref) => (
    <Button
        ref={ref}
        size="compact-sm"
        variant="subtle"
        leftSection="+"
        {...props}
    >
        Add
    </Button>
));

AddButton.displayName = 'AddButton';
