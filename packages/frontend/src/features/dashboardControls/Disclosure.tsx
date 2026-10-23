import { Box, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './ControlSidebar.module.css';
import { type ControlsSidebarSection } from './useControlsSidebar';

type DisclosureProps = {
    section: ControlsSidebarSection;
    label: string;
    summary: ReactNode;
    isOpen: boolean;
    onToggle: (section: ControlsSidebarSection) => void;
    children: ReactNode;
};

// One of the edited control's sections under its value: "Tiles" or "Rules"
export const Disclosure: FC<DisclosureProps> = ({
    section,
    label,
    summary,
    isOpen,
    onToggle,
    children,
}) => (
    <>
        <UnstyledButton
            className={classes.disclosure}
            aria-expanded={isOpen}
            onClick={() => onToggle(section)}
        >
            <Text fz="sm" fw={500}>
                {label}
            </Text>
            <Text
                fz="xs"
                c="dimmed"
                truncate
                className={classes.disclosureSummary}
            >
                {summary}
            </Text>
            <MantineIcon
                icon={IconChevronRight}
                size={14}
                color="dimmed"
                className={classes.chevron}
            />
        </UnstyledButton>
        {isOpen && <Box className={classes.panel}>{children}</Box>}
    </>
);
