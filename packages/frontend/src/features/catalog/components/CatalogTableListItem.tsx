import { type CatalogField, type CatalogTable } from '@lightdash/common';
import {
    Badge,
    Box,
    Collapse,
    Group,
    Highlight,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconLayersIntersect, IconTable } from '@tabler/icons-react';
import React, { useState, type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineLinkButton from '../../../components/common/MantineLinkButton';

type Props = {
    table: CatalogTable & { fields: CatalogField[] };
    startOpen?: boolean;
    searchString?: string;
    isSelected?: boolean;
    url: string;
    onClick?: () => void;
    isFirst: boolean;
    isLast: boolean;
};

export const CatalogTableListItem: FC<React.PropsWithChildren<Props>> = ({
    table,
    startOpen = false,
    searchString = '',
    isSelected = false,
    url,
    isFirst,
    isLast,
    onClick,
    children,
}) => {
    const [isOpen, toggleOpen] = useToggle(startOpen);
    const [hovered, setHovered] = useState<boolean | undefined>(false);

    const countJoinedTables =
        'joinedTables' in table ? table.joinedTables?.length || 0 : 0;

    return (
        <>
            <Group
                noWrap
                spacing="xs"
                p="xs"
                px="sm"
                sx={(theme) => ({
                    minHeight: 48,
                    borderBottom: isLast
                        ? 'none'
                        : `1px solid ${theme.colors.gray[2]}`,
                    backgroundColor: isSelected
                        ? theme.colors.gray[1]
                        : hovered
                        ? theme.colors.gray[2]
                        : 'transparent',
                    border: `2px solid ${
                        isSelected ? theme.colors.blue[6] : 'transparent'
                    }`,
                    cursor: 'pointer',
                    borderTopLeftRadius: isFirst ? theme.radius.md : 0,
                    borderTopRightRadius: isFirst ? theme.radius.md : 0,
                    borderBottomLeftRadius:
                        isLast && !isOpen ? theme.radius.md : 0,
                    borderBottomRightRadius:
                        isLast && !isOpen ? theme.radius.md : 0,
                })}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={onClick}
                pos="relative"
            >
                <UnstyledButton onClick={() => toggleOpen()} miw={150}>
                    <Group noWrap spacing="xs">
                        <MantineIcon icon={IconTable} color="gray" size="sm" />

                        <Highlight
                            highlight={searchString}
                            highlightColor="violet"
                            fz="sm"
                            fw={600}
                        >
                            {table.name || ''}
                        </Highlight>
                    </Group>
                </UnstyledButton>

                <Box w={50}>
                    {countJoinedTables > 0 && (
                        <Tooltip
                            variant="xs"
                            label={`${countJoinedTables} joined table(s)`}
                        >
                            <Group noWrap spacing="one">
                                <MantineIcon
                                    color="gray"
                                    icon={IconLayersIntersect}
                                />
                            </Group>
                        </Tooltip>
                    )}
                </Box>
                {!isSelected ? (
                    <Highlight
                        fz="13px"
                        w="100%"
                        c="gray.7"
                        lineClamp={2}
                        highlight={searchString}
                        highlightColor="violet"
                        sx={{
                            lineHeight: '1.2',
                        }}
                    >
                        {table.description || ''}
                    </Highlight>
                ) : (
                    <Badge color="violet">previewing</Badge>
                )}
                {(hovered || isSelected) && (
                    <Box
                        pos={'absolute'}
                        right={10}
                        sx={{
                            zIndex: 20,
                        }}
                    >
                        <MantineLinkButton
                            size="sm"
                            href={url}
                            target="_blank"
                            compact
                            sx={(theme) => ({
                                backgroundColor: theme.colors.gray[8],
                                '&:hover': {
                                    backgroundColor: theme.colors.gray[9],
                                },
                            })}
                            onClick={(e) => e.stopPropagation()}
                        >
                            Use table
                        </MantineLinkButton>
                    </Box>
                )}
            </Group>
            {React.Children.toArray.length > 0 && (
                <Collapse in={isOpen} pl="xl">
                    {children}
                </Collapse>
            )}
        </>
    );
};
