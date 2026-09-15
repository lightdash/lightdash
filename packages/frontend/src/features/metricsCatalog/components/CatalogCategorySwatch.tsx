import { interpolateUiString } from '@lightdash/common';
import { Center } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { type CSSProperties, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useCategoryColors } from '../styles/useCategoryColors';
import styles from './CatalogCategorySwatch.module.css';

type Props = {
    color: string;
    onClick: React.MouseEventHandler<HTMLButtonElement>;
    selected: boolean;
};

export const CatalogCategorySwatch: FC<Props> = ({
    color,
    onClick,
    selected,
}: Props) => {
    const colors = useCategoryColors(color);
    const getUiString = useUiStrings();

    const categoryVars = {
        '--category-text-color': colors.textColor,
        '--category-background-color': colors.backgroundColor,
        '--category-hover-background-color': colors.hoverBackgroundColor,
        '--category-border-color': colors.borderColor,
    } as CSSProperties;

    return (
        <Center
            component="button"
            type="button"
            aria-label={interpolateUiString(
                getUiString('metrics.categoryColor'),
                { color },
            )}
            aria-pressed={selected}
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
