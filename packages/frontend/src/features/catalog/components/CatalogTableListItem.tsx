import { type CatalogField, type CatalogTable } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    Highlight,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconChevronRight,
    IconExternalLink,
    IconLayersLinked,
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
};

export const CatalogTableListItem: FC<React.PropsWithChildren<Props>> = ({
    table,
    startOpen = false,
    searchString = '',
    isSelected = false,
    url,
    onClick,
    children,
}) => {
    const [isOpen, toggleOpen] = useToggle(startOpen);
    const [hovered, setHovered] = useState<boolean | undefined>(false);

    const handleOpenClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        toggleOpen();
    };

    const countJoinedTables =
        'joinedTables' in table ? table.joinedTables?.length || 0 : 0;

    return (
        <>
            <Group
                noWrap
                position="apart"
                py="sm"
                px="xs"
                sx={(theme) => ({
                    minHeight: 40,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.md,
                    backgroundColor: hovered
                        ? theme.colors.gray[2]
                        : theme.colors.gray[1],
                    border: isSelected
                        ? `2px solid ${theme.colors.blue[6]}`
                        : undefined,
                    cursor: 'pointer',
                })}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={onClick}
            >
                <Group w={55} noWrap spacing="xs">
                    <ActionIcon
                        onClick={handleOpenClick}
                        disabled={table.fields.length === 0}
                    >
                        <MantineIcon
                            icon={IconChevronRight}
                            style={{
                                margin: 1,
                                transition: 'transform 200ms ease',
                                transform: isOpen ? 'rotate(90deg)' : undefined,
                            }}
                        />
                    </ActionIcon>

                    <MantineIcon
                        icon={IconTable}
                        color="gray"
                        size="lg"
                    ></MantineIcon>
                </Group>
                <Box miw={150}>
                    <Highlight
                        highlight={searchString}
                        highlightColor="violet"
                        fw={600}
                    >
                        {table.name || ''}
                    </Highlight>
                </Box>
                <Box w={50}>
                    {countJoinedTables > 0 && (
                        <Tooltip label={`${countJoinedTables} joined tables`}>
                            <Group noWrap spacing="xs">
                                <MantineIcon
                                    color="gray"
                                    icon={IconLayersLinked}
                                />
                                <Text color="gray">{countJoinedTables}</Text>
                            </Group>
                        </Tooltip>
                    )}
                </Box>
                <Highlight
                    w="100%"
                    lineClamp={2}
                    highlight={searchString}
                    highlightColor="violet"
                >
                    {table.description || ''}
                </Highlight>
                {hovered && (
                    <Box>
                        <MantineLinkButton
                            href={url}
                            variant="subtle"
                            target="_blank"
                            compact
                            rightIcon={<MantineIcon icon={IconExternalLink} />}
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
