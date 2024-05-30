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
    hidden?: boolean;
    isLast: boolean;
};

export const CatalogGroup: FC<React.PropsWithChildren<Props>> = ({
    label,
    tableCount,
    startOpen = false,
    hidden = false,
    isLast,
    children,
}) => {
    const [isOpen, toggleOpen] = useToggle(startOpen);

    return (
        <>
            {!hidden && (
                <UnstyledButton
                    onClick={toggleOpen}
                    p="sm"
                    w="100%"
                    pos="relative"
                    sx={(theme) => ({
                        paddingBottom: !isLast ? theme.spacing.xs : 0,
                        ...(!isLast && !isOpen
                            ? // Adds offset to the bottom border of all groups except the last one (aligns with chevron icon)
                              {
                                  '&::after': {
                                      content: '""',
                                      position: `absolute`,
                                      top: '90%',
                                      left: '12px',
                                      width: '100%',
                                      height: '1px',
                                      background: theme.colors.gray[3],
                                  },
                              }
                            : {}),
                    })}
                >
                    <Group spacing={'xs'} noWrap align="center">
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
                                    transform: isOpen
                                        ? 'rotate(90deg)'
                                        : undefined,
                                }}
                            />
                        </Avatar>

                        <Group w="100%">
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
                    </Group>
                </UnstyledButton>
            )}
            <Collapse in={isOpen}>
                <Box
                    mb="sm"
                    ml="sm"
                    sx={(theme) => ({
                        border: `1px solid ${theme.colors.gray[2]}`,
                        borderRadius: theme.radius.md,
                        backgroundColor: 'white',
                    })}
                >
                    {children}
                </Box>
            </Collapse>
        </>
    );
};
