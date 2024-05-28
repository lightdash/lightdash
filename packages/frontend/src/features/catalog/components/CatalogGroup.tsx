import {
    Badge,
    Box,
    Collapse,
    Group,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconBoxMultiple, IconChevronRight } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    label: string;
    tableCount: number;
    startOpen?: boolean;
};

export const CatalogGroup: FC<React.PropsWithChildren<Props>> = ({
    label,
    tableCount,
    startOpen = false,
    children,
}) => {
    const [isOpen, toggleOpen] = useToggle(startOpen);

    return (
        <>
            <UnstyledButton
                onClick={toggleOpen}
                sx={(theme) => ({
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.xs,
                    width: '100%',
                })}
            >
                <Group spacing={'xs'}>
                    <MantineIcon
                        icon={IconChevronRight}
                        size={14}
                        style={{
                            margin: 1,
                            transition: 'transform 200ms ease',
                            transform: isOpen ? 'rotate(90deg)' : undefined,
                        }}
                    />
                    <MantineIcon
                        size={'md'}
                        color="gray"
                        icon={IconBoxMultiple}
                    />
                    <Text fw={600} fz={14}>
                        {label}
                    </Text>
                    <Badge color="blue" variant="light">
                        {tableCount}
                    </Badge>
                </Group>
            </UnstyledButton>
            <Collapse in={isOpen} pl="md">
                <Box
                    sx={(theme) => ({
                        border: `1px solid ${theme.colors.gray[2]}`,
                        borderRadius: theme.radius.sm,
                        backgroundColor: 'white',
                    })}
                >
                    {children}
                </Box>
            </Collapse>
        </>
    );
};
