import { Button, type ButtonProps } from '@mantine/core';
import type { FC } from 'react';

type BadgeButtonProps = ButtonProps & {
    onClick?: () => void;
};

const BadgeButton: FC<BadgeButtonProps> = ({ children, ...props }) => {
    return (
        <Button
            variant="outline"
            {...props}
            // TODO: fix the stylings here
            size="xs"
            px={10}
            py={0}
            h={20}
            radius="xl"
        >
            {children}
        </Button>
    );
};

export default BadgeButton;
