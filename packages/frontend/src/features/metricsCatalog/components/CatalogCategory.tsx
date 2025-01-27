import type { CatalogItem } from '@lightdash/common';
import { ActionIcon, Badge, Group, Tooltip } from '@mantine/core';
import { IconCode, IconX } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCategoryStyles } from '../styles/useCategoryStyles';

type Props = {
    category: Pick<
        CatalogItem['categories'][number],
        'name' | 'color' | 'yamlReference'
    >;
    onClick?: React.MouseEventHandler<HTMLDivElement> | undefined;
    onRemove?: () => void;
    showYamlIcon?: boolean;
};

export const CatalogCategory: FC<Props> = ({
    category,
    onClick,
    onRemove,
    showYamlIcon = false,
}) => {
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
            rightSection={
                showYamlIcon && (
                    <Tooltip
                        variant="xs"
                        maw={200}
                        position="top"
                        withinPortal
                        label="This category cannot be removed from this metric because it was defined in the .yml file."
                    >
                        <MantineIcon
                            icon={IconCode}
                            size={12}
                            strokeWidth={2.5}
                            opacity={0.5}
                        />
                    </Tooltip>
                )
            }
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
