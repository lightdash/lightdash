import { Badge, Text } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
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
            variant="light"
            color="gray"
            rightSection={
                !disabled ? (
                    <MantineIcon icon={IconChevronDown} size="sm" />
                ) : undefined
            }
            sx={{
                textTransform: 'unset',
                cursor: !disabled ? 'pointer' : 'not-allowed',
                '&:hover': !disabled ? { opacity: 0.8 } : undefined,
                '&:active': !disabled ? { opacity: 0.9 } : undefined,
            }}
        >
            <Text span fw={500}>
                Limit:
            </Text>{' '}
            {limit}
        </Badge>
    ),
);

export default LimitBadge;
