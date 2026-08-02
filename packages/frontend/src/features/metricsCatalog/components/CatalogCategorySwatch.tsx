import { Center } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { type CSSProperties, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCategoryColors } from '../styles/useCategoryColors';
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
    const colors = useCategoryColors(color);

    const categoryVars = {
        '--category-text-color': colors.textColor,
        '--category-background-color': colors.backgroundColor,
        '--category-hover-background-color': colors.hoverBackgroundColor,
        '--category-border-color': colors.borderColor,
    } as CSSProperties;

    return (
        <Center
            h={18}
            w={18}
            className={styles.swatch}
            style={categoryVars}
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
