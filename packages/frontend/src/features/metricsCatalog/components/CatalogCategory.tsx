import type { CatalogItem } from '@lightdash/common';
import { ActionIcon, Badge, Group } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCategoryStyles } from '../styles/useCategoryStyles';

type Props = {
    category: Pick<CatalogItem['categories'][number], 'name' | 'color'>;
    onClick?: React.MouseEventHandler<HTMLDivElement> | undefined;
    onRemove?: () => void;
};

export const CatalogCategory: FC<Props> = ({ category, onClick, onRemove }) => {
    const { classes } = useCategoryStyles(category.color);

    return (
        <Badge
            key={category.name}
            pos="relative"
            size="sm"
            radius="md"
            variant="light"
            onClick={onClick}
            py={10}
            h={24}
            className={classes.base}
            styles={() => ({
                root: {
                    fontSize: '12px',
                    textTransform: 'none',
                    fontWeight: 500,
                    paddingRight: onRemove ? 2 : 8,
                },
            })}
        >
            <Group spacing={1}>
                {category.name}
                {onRemove && (
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size={14}
                        onClick={onRemove}
                    >
                        <MantineIcon
                            className={classes.removeIcon}
                            icon={IconX}
                            strokeWidth={2.5}
                        />
                    </ActionIcon>
                )}
            </Group>
        </Badge>
    );
};
