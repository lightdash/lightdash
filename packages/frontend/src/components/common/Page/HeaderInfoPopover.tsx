import { ActionIcon, Popover } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
import {
    ResourceInfoPopupContent,
    type ResourceInfoPopupProps,
} from '../ResourceInfoPopup/ResourceInfoPopup';
import classes from './HeaderInfoPopover.module.css';

type Props = {
    label: string;
    info: ResourceInfoPopupProps;
    /** Walkthrough markers for the button. */
    tourProps?: Record<`data-tour-${string}`, string>;
};

/** The (i) button in a content header: description, editor, space, views. */
export const HeaderInfoPopover: FC<Props> = ({ label, info, tourProps }) => (
    <Popover withArrow offset={{ mainAxis: -2, crossAxis: 6 }}>
        <Popover.Target>
            <ActionIcon size="md" aria-label={label} {...tourProps}>
                <MantineIcon icon={IconInfoCircle} />
            </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown w={320} mah={480} p="md" className={classes.dropdown}>
            <ResourceInfoPopupContent {...info} />
        </Popover.Dropdown>
    </Popover>
);
