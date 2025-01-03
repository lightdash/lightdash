import { Center } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCategoryStyles } from '../styles/useCategoryStyles';

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
    const { classes, theme, cx } = useCategoryStyles(color);
    return (
        <Center
            h={18}
            w={18}
            className={cx(classes.base, classes.withHover)}
            onClick={onClick}
            sx={{
                borderRadius: theme.radius.sm,
            }}
        >
            {selected && (
                <MantineIcon
                    icon={IconCheck}
                    strokeWidth={2}
                    color="dark"
                    size={12}
                />
            )}
        </Center>
    );
};
