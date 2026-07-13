import type { CatalogItem } from '@lightdash/common';
import { Group, ActionIcon, Badge } from '@mantine-8/core';
import { Tooltip } from '@mantine/core';
import { IconCode, IconX } from '@tabler/icons-react';
import type { CSSProperties, FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCategoryColors } from '../styles/useCategoryColors';
import styles from './CatalogCategory.module.css';

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
    const colors = useCategoryColors(category.color);

    const categoryVars = {
        '--category-text-color': colors.textColor,
        '--category-background-color': colors.backgroundColor,
        '--category-hover-background-color': colors.hoverBackgroundColor,
        '--category-border-color': colors.borderColor,
        '--category-focus-outline-color': colors.focusOutlineColor,
    } as CSSProperties;

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
            pr={onRemove ? 2 : 8}
            rightSection={
                showYamlIcon && (
                    <Tooltip
                        variant="xs"
                        maw={200}
                        position="top"
                        withinPortal
                        openDelay={200}
                        fz="xs"
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
            className={styles.base}
            style={categoryVars}
        >
            <Group gap={1}>
                {category.name}
                {onRemove && (
                    <ActionIcon
                        variant="subtle"
                        size={14}
                        onClick={onRemove}
                        className={styles.removeButton}
                    >
                        <MantineIcon
                            color={colors.removeIconColor}
                            icon={IconX}
                            strokeWidth={2.5}
                        />
                    </ActionIcon>
                )}
            </Group>
        </Badge>
    );
};
