import { type CatalogField, type CatalogTable } from '@lightdash/common';
import {
    Badge,
    Box,
    Collapse,
    Grid,
    Group,
    Highlight,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconLayersIntersect, IconTable } from '@tabler/icons-react';
import React, { useState, type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineLinkButton from '../../../components/common/MantineLinkButton';
import { useIsTruncated } from '../../../hooks/useIsTruncated';

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
    const { ref, isTruncated: isNameTruncated } =
        useIsTruncated<HTMLDivElement>();

    const countJoinedTables =
        'joinedTables' in table ? table.joinedTables?.length || 0 : 0;

    return (
        <>
            <Grid
                gutter="xs"
                columns={24}
                px="sm"
                sx={(theme) => ({
                    // Mantine's grid applies a negative margin to the container. That breaks the border radius & hover effects
                    margin: 0,
                    alignItems: 'center',
                    minHeight: 48,
                    borderBottom:
                        isLast || isOpen
                            ? 'none'
                            : `1px solid ${theme.colors.gray[2]}`,
                    backgroundColor: hovered
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
                <Grid.Col span={'content'}>
                    <MantineIcon icon={IconTable} color="gray.6" size="md" />
                </Grid.Col>

                <Grid.Col span={10}>
                    <UnstyledButton onClick={() => toggleOpen()} w="100%">
                        <Tooltip
                            variant="xs"
                            disabled={!isNameTruncated}
                            label={table.label}
                        >
                            <Highlight
                                ref={ref}
                                w="auto"
                                highlight={searchString}
                                highlightColor="yellow"
                                fz="sm"
                                fw={600}
                                truncate
                            >
                                {table.label || ''}
                            </Highlight>
                        </Tooltip>
                    </UnstyledButton>
                </Grid.Col>
                <Grid.Col span={'content'}>
                    <Tooltip
                        variant="xs"
                        disabled={countJoinedTables === 0}
                        label={`${countJoinedTables} joined table(s)`}
                    >
                        <Group noWrap spacing="one">
                            <MantineIcon
                                color="gray.5"
                                icon={IconLayersIntersect}
                                visibility={
                                    countJoinedTables === 0
                                        ? 'hidden'
                                        : 'visible'
                                }
                            />
                        </Group>
                    </Tooltip>
                </Grid.Col>

                <Grid.Col span={'auto'}>
                    {table.errors && table.errors.length > 0 ? (
                        <Text fz="13px" c="gray.7" w="100%" lineClamp={2}>
                            {table.errors[0].message}
                        </Text>
                    ) : !isSelected ? (
                        <Highlight
                            fz="13px"
                            w="auto"
                            c="gray.7"
                            lineClamp={2}
                            highlight={searchString}
                            highlightColor="yellow"
                        >
                            {table.description || ''}
                        </Highlight>
                    ) : (
                        <Badge color="violet">previewing</Badge>
                    )}
                </Grid.Col>

                {(hovered || isSelected) && table.errors === undefined && (
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
            </Grid>
            {React.Children.toArray.length > 0 && (
                <Collapse in={isOpen} pl="xl">
                    {children}
                </Collapse>
            )}
        </>
    );
};
