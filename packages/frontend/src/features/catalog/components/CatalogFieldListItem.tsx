import { FieldType, type CatalogField } from '@lightdash/common';
import { Box, Group, Highlight } from '@mantine/core';
import {
    IconCircleDashedNumber0,
    IconCircleLetterS,
} from '@tabler/icons-react';
import React, { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    field: CatalogField;
    searchString?: string;
    isSelected?: boolean;

    onClick?: () => void;
};

const CatalogIcon = ({ item }: { item: CatalogField }) => {
    switch (item.fieldType) {
        case FieldType.DIMENSION:
            return <MantineIcon color="blue.5" icon={IconCircleLetterS} />;
        case FieldType.METRIC:
            return (
                <MantineIcon color="violet.5" icon={IconCircleDashedNumber0} />
            );

        default:
            return null;
    }
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
                    minHeight: 32,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.two,
                    backgroundColor: hovered
                        ? theme.colors.gray[1]
                        : 'transparent',
                    border: isSelected
                        ? `2px solid ${theme.colors.blue[6]}`
                        : undefined,
                })}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={onClick}
            >
                <Box miw={150}>
                    <Group
                        spacing="two"
                        noWrap
                        sx={(theme) => ({
                            border: `1px solid ${theme.colors.gray[3]}`,
                            borderRadius: theme.radius.sm,
                            padding: 5,
                            width: 'fit-content',
                        })}
                    >
                        <CatalogIcon item={field} />

                        <Highlight
                            fz="xs"
                            highlight={searchString}
                            highlightColor="yellow.1"
                            fw={500}
                        >
                            {field.name || ''}
                        </Highlight>
                    </Group>
                </Box>
            </Group>
        </>
    );
};
