import { Stack, UnstyledButton } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { NAVBAR_HEIGHT } from '../../../../components/common/Page/constants';
import {
    getAgentSettingsSections,
    type AgentSettingsSectionId,
} from '../utils/agentSettingsSections';
import classes from './AgentSettingsSectionNav.module.css';

const SCROLL_OFFSET = NAVBAR_HEIGHT + 24;

type Props = {
    mode: 'create' | 'edit';
};

export const AgentSettingsSectionNav: FC<Props> = ({ mode }) => {
    const sections = useMemo(() => getAgentSettingsSections(mode), [mode]);
    const [activeId, setActiveId] = useState<AgentSettingsSectionId | null>(
        null,
    );

    // Scroll-spy: the active section is the last one whose top has passed
    // under the fixed navbar.
    useEffect(() => {
        let frame: number | null = null;

        const measure = () => {
            frame = null;
            const passed = sections.filter((section) => {
                const element = document.getElementById(section.id);
                return (
                    element !== null &&
                    element.getBoundingClientRect().top <= SCROLL_OFFSET
                );
            });
            setActiveId(passed.at(-1)?.id ?? sections[0]?.id ?? null);
        };

        const onScroll = () => {
            if (frame === null) {
                frame = window.requestAnimationFrame(measure);
            }
        };

        measure();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            if (frame !== null) {
                window.cancelAnimationFrame(frame);
            }
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [sections]);

    const handleClick = useCallback((id: AgentSettingsSectionId) => {
        document
            .getElementById(id)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    return (
        <Stack gap={2} className={classes.list}>
            {sections.map((section) => (
                <UnstyledButton
                    key={section.id}
                    className={classes.item}
                    data-active={activeId === section.id}
                    aria-current={activeId === section.id ? 'true' : undefined}
                    onClick={() => handleClick(section.id)}
                >
                    {section.label}
                </UnstyledButton>
            ))}
        </Stack>
    );
};
