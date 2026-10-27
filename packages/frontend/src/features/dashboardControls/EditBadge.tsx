import { ThemeIcon } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './FilterPills.module.css';

// In place of a pill's field icon while that filter is open (the rail, or a
// viewer's popover); the pill keeps its own fill and border
export const EditBadge: FC = () => (
    <ThemeIcon
        size={16}
        radius="xl"
        color="blue"
        variant="filled"
        className={classes.editBadge}
        data-edit-badge
    >
        <MantineIcon icon={IconPencil} size={10} />
    </ThemeIcon>
);
