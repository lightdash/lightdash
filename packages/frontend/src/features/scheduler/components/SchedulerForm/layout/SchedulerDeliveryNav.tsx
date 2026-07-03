import { Stack } from '@mantine-8/core';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    NAV_GROUP_LABELS,
    SCHEDULER_SECTIONS,
    type SchedulerNavGroup,
    type SchedulerSectionId,
} from './navSections';
import classes from './SchedulerDeliveryModal.module.css';

type Props = {
    sections: SchedulerSectionId[];
    active: SchedulerSectionId;
    onSelect: (id: SchedulerSectionId) => void;
};

const GROUP_ORDER: SchedulerNavGroup[] = ['delivery', 'content'];

export const SchedulerDeliveryNav: FC<Props> = ({
    sections,
    active,
    onSelect,
}) => {
    return (
        <nav className={classes.nav}>
            <Stack gap="lg">
                {GROUP_ORDER.map((group) => {
                    const groupSections = sections.filter(
                        (id) => SCHEDULER_SECTIONS[id].group === group,
                    );
                    if (groupSections.length === 0) return null;
                    return (
                        <Stack key={group} gap={4}>
                            <div className={classes.navGroupLabel}>
                                {NAV_GROUP_LABELS[group]}
                            </div>
                            {groupSections.map((id) => {
                                const section = SCHEDULER_SECTIONS[id];
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onSelect(id)}
                                        className={
                                            id === active
                                                ? `${classes.navItem} ${classes.navItemActive}`
                                                : classes.navItem
                                        }
                                    >
                                        <MantineIcon
                                            icon={section.icon}
                                            size="md"
                                        />
                                        <span className={classes.navItemLabel}>
                                            {section.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </Stack>
                    );
                })}
            </Stack>
        </nav>
    );
};
