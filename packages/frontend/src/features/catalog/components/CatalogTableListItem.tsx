import { type CatalogField, type CatalogTable } from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    Highlight,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconExternalLink,
    IconLayersIntersect,
    IconTable,
} from '@tabler/icons-react';
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
                position="apart"
                spacing="xs"
                p="xs"
                px="sm"
                sx={(theme) => ({
                    minHeight: 48,
                    borderBottom: isLast
                        ? 'none'
                        : `1px solid ${theme.colors.gray[2]}`,
                    backgroundColor: hovered
                        ? theme.colors.gray[1]
                        : 'transparent',
                    border: isSelected
                        ? `2px solid ${theme.colors.blue[6]}`
                        : undefined,
                    cursor: 'pointer',
                    borderTopLeftRadius: isFirst ? theme.radius.lg : 0,
                    borderTopRightRadius: isFirst ? theme.radius.lg : 0,
                    borderBottomLeftRadius:
                        isLast && !isOpen ? theme.radius.lg : 0,
                    borderBottomRightRadius:
                        isLast && !isOpen ? theme.radius.lg : 0,
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
                <Highlight
                    fz="xs"
                    w="100%"
                    lineClamp={2}
                    highlight={searchString}
                    highlightColor="violet"
                >
                    {table.description || ''}
                </Highlight>
                {hovered && (
                    <Box
                        pos={'absolute'}
                        right={10}
                        sx={{
                            zIndex: 20,
                        }}
                    >
                        <MantineLinkButton
                            size="xs"
                            href={url}
                            target="_blank"
                            compact
                            rightIcon={
                                <MantineIcon
                                    size="sm"
                                    icon={IconExternalLink}
                                />
                            }
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
