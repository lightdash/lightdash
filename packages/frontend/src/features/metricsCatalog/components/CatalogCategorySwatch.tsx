import { Center } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCategoryStyles } from '../styles/useCategoryStyles';
import styles from './CatalogCategorySwatch.module.css';

type Props = {
    color: string;
    onClick: React.MouseEventHandler<HTMLDivElement>;
    selected: boolean;
};

export const CatalogCategorySwatch: FC<Props> = ({
    color,
    onClick,
    selected,
}: Props) => {
    const { classes, cx } = useCategoryStyles(color);
    return (
        <Center
            h={18}
            w={18}
            className={cx(classes.base, classes.withHover, styles.swatch)}
            onClick={onClick}
        >
            {selected && (
                <MantineIcon
                    icon={IconCheck}
                    strokeWidth={2}
                    color="foreground"
                    size={12}
                />
            )}
        </Center>
    );
};
