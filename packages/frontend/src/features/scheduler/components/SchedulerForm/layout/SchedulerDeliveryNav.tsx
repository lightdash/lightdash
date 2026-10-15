import { Select, Stack, useMatches } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { AiAgentIcon } from '../../../../../ee/features/aiCopilot/components/AiAgentIcon';
import {
    NAV_GROUP_LABEL_KEYS,
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
    const { t } = useTranslation('scheduler');
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    if (compact) {
        return (
            <Select
                m="md"
                aria-label={t('sections.navAriaLabel')}
                value={active}
                allowDeselect={false}
                data={sections.map((id) => ({
                    value: id,
                    label: t(SCHEDULER_SECTIONS[id].labelKey),
                }))}
                onChange={(value) => {
                    const section = sections.find((id) => id === value);
                    if (section) onSelect(section);
                }}
            />
        );
    }
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
                                {t(NAV_GROUP_LABEL_KEYS[group])}
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
                                        {id === 'ai' ? (
                                            <AiAgentIcon muted size={16} />
                                        ) : (
                                            <MantineIcon
                                                icon={section.icon}
                                                size="md"
                                            />
                                        )}
                                        <span className={classes.navItemLabel}>
                                            {t(section.labelKey)}
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
