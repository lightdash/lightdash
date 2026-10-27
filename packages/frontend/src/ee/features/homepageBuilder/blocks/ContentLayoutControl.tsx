import { type HomepageContentLayout } from '@lightdash/common';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconLayoutGrid, IconLayoutList } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import classes from './blockStyles.module.css';

const OPTIONS = [
    { value: 'card', label: 'Cards', icon: IconLayoutGrid },
    { value: 'list', label: 'Compact', icon: IconLayoutList },
] as const;

/** The one layout switcher every content-listing block uses, so the options
 * always carry the same icons and names. Compact's arrangement (tile columns
 * vs rows) resolves from the block's width — geometry is not an admin choice. */
export const ContentLayoutControl: FC<{
    value: HomepageContentLayout;
    onChange: (layout: HomepageContentLayout) => void;
}> = ({ value, onChange }) => (
    <Group gap={2} wrap="nowrap" role="group" aria-label="Layout">
        {OPTIONS.map((option) => (
            <Tooltip key={option.value} label={option.label} openDelay={200}>
                <ActionIcon
                    size={24}
                    variant="subtle"
                    color="gray"
                    className={classes.layoutToggle}
                    aria-label={option.label}
                    aria-pressed={value === option.value}
                    data-active={value === option.value}
                    onClick={() => onChange(option.value)}
                >
                    <MantineIcon icon={option.icon} size={15} />
                </ActionIcon>
            </Tooltip>
        ))}
    </Group>
);
