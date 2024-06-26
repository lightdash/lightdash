import { FieldType, type CatalogField } from '@lightdash/common';
import { Badge, Grid, Highlight } from '@mantine/core';
import { Icon123, IconAbc } from '@tabler/icons-react';
import React, { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';

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
    const { ref: descriptionRef } = useIsTruncated<HTMLDivElement>();
    const [hovered, setHovered] = useState<boolean | undefined>(false);

    return (
        <Grid
            gutter="xs"
            columns={24}
            sx={(theme) => ({
                cursor: 'pointer',
                // Mantine's grid applies a negative margin to the container. That breaks the border radius & hover effects
                margin: 0,
                alignItems: 'center',
                borderRadius: theme.radius.sm,
                backgroundColor: hovered ? theme.colors.gray[1] : 'transparent',
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
            <Grid.Col span={'content'}>
                <MantineIcon
                    icon={
                        // TODO: Add icon for field type and for subtype
                        field.fieldType === FieldType.DIMENSION
                            ? IconAbc
                            : Icon123
                    }
                    // TODO: Add icon for field type and for subtype
                    color={
                        field.fieldType === FieldType.DIMENSION
                            ? 'blue'
                            : 'orange'
                    }
                />
            </Grid.Col>

            <Grid.Col span={10}>
                <Highlight
                    highlight={searchString}
                    highlightColor="yellow"
                    fw={500}
                    fz="sm"
                >
                    {field.label ?? ''}
                </Highlight>
            </Grid.Col>

            <Grid.Col span={'auto'}>
                {!isSelected ? (
                    <Highlight
                        ref={descriptionRef}
                        fz="13px"
                        w="auto"
                        c="gray.7"
                        lineClamp={2}
                        highlight={searchString}
                        highlightColor="yellow"
                    >
                        {field.description || ''}
                    </Highlight>
                ) : (
                    <Badge color="violet">previewing</Badge>
                )}
            </Grid.Col>
        </Grid>
    );
};
