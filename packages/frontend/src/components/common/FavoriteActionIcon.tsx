import {
    ActionIcon,
    Tooltip,
    type ActionIconProps,
    type MantineColor,
} from '@mantine/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { type FC, type MouseEvent } from 'react';
import MantineIcon, { type MantineIconSize } from './MantineIcon';

type Props = Omit<ActionIconProps, 'children' | 'color'> & {
    isFavorite: boolean;
    onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
    /** Shown in the tooltip and aria-label, e.g. "Remove <name> from favorites". */
    name?: string;
    /** Custom tooltip and accessible label for other star-toggle meanings. */
    label?: string;
    iconSize?: MantineIconSize;
    favoriteColor?: MantineColor;
};

export const FavoriteActionIcon: FC<Props> = ({
    isFavorite,
    onToggle,
    name,
    label: customLabel,
    iconSize,
    favoriteColor = 'orange',
    ...rest
}) => {
    const subject = name ? ` ${name}` : '';
    const label =
        customLabel ??
        (isFavorite
            ? `Remove${subject} from favorites`
            : `Add${subject} to favorites`);

    return (
        <Tooltip label={label}>
            <ActionIcon
                color={isFavorite ? favoriteColor : undefined}
                aria-label={label}
                onClick={onToggle}
                {...rest}
            >
                <MantineIcon
                    size={iconSize}
                    icon={isFavorite ? IconStarFilled : IconStar}
                />
            </ActionIcon>
        </Tooltip>
    );
};
