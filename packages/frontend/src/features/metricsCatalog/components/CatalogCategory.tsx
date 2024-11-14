import type { CatalogItem } from '@lightdash/common';
import { ActionIcon, Badge, Box, Group, useMantineTheme } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    category: Pick<CatalogItem['categories'][number], 'name' | 'color'>;
    onClick?: React.MouseEventHandler<HTMLDivElement> | undefined;
    onRemove?: () => void;
    selected?: boolean;
};

export const CatalogCategory: FC<Props> = ({
    category,
    onClick,
    onRemove,
    selected,
}) => {
    const { fn } = useMantineTheme();
    return (
        <Badge
            key={category.name}
            pos="relative"
            size="sm"
            radius="xl"
            variant="light"
            onClick={onClick}
            styles={(theme) => ({
                root: {
                    textTransform: 'none',
                    fontWeight: 400,
                    border: `1px solid ${fn.lighten(category.color, 0.6)}`,
                    backgroundColor: fn.lighten(category.color, 0.9),
                    color: fn.darken(category.color, 0.2),
                    cursor: 'pointer',
                    paddingRight: onRemove ? 2 : 8,
                    boxShadow: theme.shadows.subtle,
                    '&:hover': {
                        backgroundColor: fn.lighten(category.color, 0.8),
                    },
                },
            })}
        >
            <Group spacing={1}>
                {category.name}
                {onRemove && (
                    <ActionIcon
                        variant="transparent"
                        size={12}
                        onClick={onRemove}
                    >
                        <MantineIcon
                            color={fn.darken(category.color, 0.4)}
                            icon={IconX}
                            strokeWidth={1.8}
                        />
                    </ActionIcon>
                )}
            </Group>
            {selected && (
                <Box pos="absolute" right={2} top={2}>
                    <MantineIcon
                        icon={IconCheck}
                        strokeWidth={2}
                        color="dark"
                        size={12}
                    />
                </Box>
            )}
        </Badge>
    );
};
