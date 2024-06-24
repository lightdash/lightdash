import { FieldType, type CatalogField } from '@lightdash/common';
import { Box, Group, Highlight } from '@mantine/core';
import { Icon123, IconAbc } from '@tabler/icons-react';
import React, { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    field: CatalogField;
    searchString?: string;
    isSelected?: boolean;

    onClick?: () => void;
};

export const CatalogFieldListItem: FC<React.PropsWithChildren<Props>> = ({
    field,
    searchString = '',
    isSelected = false,
    onClick,
}) => {
    const [hovered, setHovered] = useState<boolean | undefined>(false);

    return (
        <>
            <Group
                noWrap
                sx={(theme) => ({
                    cursor: 'pointer',
                    borderRadius: theme.radius.sm,
                    backgroundColor: hovered
                        ? theme.colors.gray[1]
                        : 'transparent',
                    border: `2px solid ${
                        isSelected ? theme.colors.blue[6] : 'transparent'
                    }`,
                })}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={onClick}
                py="two"
                mr="xs"
            >
                <Box miw={150}>
                    <Group
                        spacing="xs"
                        noWrap
                        w="fit-content"
                        px="xs"
                        sx={(theme) => ({
                            border: `1px solid ${theme.colors.gray[2]}`,
                            borderRadius: theme.radius.md,
                        })}
                    >
                        <MantineIcon
                            icon={
                                // TODO: Add icon for field type and for subtype
                                field.fieldType === FieldType.DIMENSION
                                    ? IconAbc
                                    : Icon123
                            }
                            // TODO: update when new icons are added
                            color={
                                field.fieldType === FieldType.DIMENSION
                                    ? 'blue'
                                    : 'orange'
                            }
                        />

                        <Highlight
                            highlight={searchString}
                            highlightColor="yellow"
                            fw={500}
                            fz="sm"
                        >
                            {field.label ?? ''}
                        </Highlight>
                    </Group>
                </Box>
            </Group>
        </>
    );
};
