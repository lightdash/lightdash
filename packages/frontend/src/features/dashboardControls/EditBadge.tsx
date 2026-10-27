import { ThemeIcon } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './FilterPills.module.css';

// A pill's first icon while that filter is open (the rail, or a viewer's
// popover), named so the pill announces it; its fill and border stay
export const EditBadge: FC = () => {
    const getUiString = useUiStrings();
    return (
        <ThemeIcon
            size={16}
            radius="xl"
            color="blue"
            variant="filled"
            className={classes.editBadge}
            role="img"
            aria-label={getUiString('filters.rail.editingBadge')}
            data-edit-badge
        >
            <MantineIcon icon={IconPencil} size={10} aria-hidden />
        </ThemeIcon>
    );
};
