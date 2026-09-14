import { ActionIcon, Tooltip, type ActionIconProps } from '@mantine/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { type FC, type MouseEvent } from 'react';
import MantineIcon from './MantineIcon';

type Props = Omit<ActionIconProps, 'children' | 'color'> & {
    isFavorite: boolean;
    onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
    /** Shown in the tooltip and aria-label, e.g. "Remove <name> from favorites". */
    name?: string;
};

export const FavoriteActionIcon: FC<Props> = ({
    isFavorite,
    onToggle,
    name,
    ...rest
}) => {
    const subject = name ? ` ${name}` : '';
    const label = isFavorite
        ? `Remove${subject} from favorites`
        : `Add${subject} to favorites`;

    return (
        <Tooltip label={label}>
            <ActionIcon
                color={isFavorite ? 'orange' : undefined}
                aria-label={label}
                onClick={onToggle}
                {...rest}
            >
                <MantineIcon icon={isFavorite ? IconStarFilled : IconStar} />
            </ActionIcon>
        </Tooltip>
    );
};
