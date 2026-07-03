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

export type SchedulerSectionDot = 'new' | 'required';

type Props = {
    sections: SchedulerSectionId[];
    active: SchedulerSectionId;
    onSelect: (id: SchedulerSectionId) => void;
    dots: Partial<Record<SchedulerSectionId, SchedulerSectionDot>>;
};

const GROUP_ORDER: SchedulerNavGroup[] = ['delivery', 'content'];

export const SchedulerDeliveryNav: FC<Props> = ({
    sections,
    active,
    onSelect,
    dots,
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
                                const dot = dots[id];
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
                                        {dot && (
                                            <span
                                                className={`${classes.dot} ${
                                                    dot === 'new'
                                                        ? classes.dotNew
                                                        : classes.dotRequired
                                                }`}
                                            />
                                        )}
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
