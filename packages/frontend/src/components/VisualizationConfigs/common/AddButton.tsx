import { Button, type ButtonProps } from '@mantine/core';
import { type ButtonHTMLAttributes, type FC } from 'react';

type Props = ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const AddButton: FC<Props> = ({ ...props }) => (
    <Button
        size="sm"
        variant="subtle"
        compact
        leftIcon="+"
        {...props}
        styles={{
            leftIcon: {
                marginRight: 2,
            },
        }}
    >
        Add
    </Button>
);
