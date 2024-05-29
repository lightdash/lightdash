import {
    Avatar,
    Badge,
    Box,
    Collapse,
    Group,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    label: string;
    tableCount: number;
    startOpen?: boolean;
    isLast: boolean;
};

export const CatalogGroup: FC<React.PropsWithChildren<Props>> = ({
    label,
    tableCount,
    startOpen = false,
    isLast,
    children,
}) => {
    const [isOpen, toggleOpen] = useToggle(startOpen);

    return (
        <>
            <UnstyledButton
                onClick={toggleOpen}
                p="sm"
                w="100%"
                sx={(theme) => ({
                    borderBottom:
                        !isLast && !isOpen
                            ? `1px solid ${theme.colors.gray[3]}`
                            : undefined,
                })}
            >
                <Group spacing={'xs'}>
                    <Avatar
                        radius="xl"
                        color="gray"
                        size="xs"
                        styles={(theme) => ({
                            placeholder: {
                                backgroundColor: theme.colors.gray[2],
                            },
                        })}
                    >
                        <MantineIcon
                            icon={IconChevronRight}
                            size={14}
                            style={{
                                margin: 1,
                                transition: 'transform 200ms ease',
                                transform: isOpen ? 'rotate(90deg)' : undefined,
                            }}
                        />
                    </Avatar>

                    <Text fw={600} fz={14}>
                        {label}
                    </Text>
                    <Badge
                        color="gray"
                        size="xs"
                        radius="xl"
                        sx={(theme) => ({
                            backgroundColor: theme.colors.gray[2],
                        })}
                    >
                        {tableCount}
                    </Badge>
                </Group>
            </UnstyledButton>
            <Collapse in={isOpen}>
                <Box
                    mb="sm"
                    ml="sm"
                    sx={(theme) => ({
                        border: `1px solid ${theme.colors.gray[2]}`,
                        borderRadius: theme.radius.lg,
                        backgroundColor: 'white',
                    })}
                >
                    {children}
                </Box>
            </Collapse>
        </>
    );
};
