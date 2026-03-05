import { Button, type ButtonProps } from '@mantine-8/core';
import { type ButtonHTMLAttributes, type FC } from 'react';

type Props = ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const AddButton: FC<Props> = ({ ...props }) => (
    <Button size="compact-sm" variant="subtle" leftSection="+" {...props}>
        Add
    </Button>
);
