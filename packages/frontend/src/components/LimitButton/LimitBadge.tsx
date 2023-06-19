import { Badge } from '@mantine/core';
import { IconCaretDown } from '@tabler/icons-react';
import { forwardRef } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    limit: number;
    disabled?: boolean;
    onClick?: () => void;
};

const LimitBadge = forwardRef<HTMLDivElement, Props>(
    ({ limit, disabled, onClick }, ref) => (
        <Badge
            ref={ref}
            onClick={onClick}
            variant={disabled ? 'light' : 'filled'}
            color="gray"
            rightSection={
                !disabled ? (
                    <MantineIcon icon={IconCaretDown} fill="white" />
                ) : undefined
            }
            sx={{
                cursor: !disabled ? 'pointer' : 'not-allowed',
                '&:hover': !disabled ? { opacity: 0.8 } : undefined,
                '&:active': !disabled ? { opacity: 0.9 } : undefined,
            }}
        >
            Limit: {limit}
        </Badge>
    ),
);

export default LimitBadge;
