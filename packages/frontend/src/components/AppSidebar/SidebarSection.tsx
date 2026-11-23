import { Box, Collapse, UnstyledButton } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../common/MantineIcon';
import classes from './AppSidebar.module.css';

const FOLDED_SECTIONS_STORAGE_KEY = 'app-sidebar:folded-sections';

export type SidebarSectionItem = {
    key: string;
    /** The page being viewed stays in sight when its section is folded. */
    isActive: boolean;
    element: ReactNode;
};

type Props = {
    sectionKey: string;
    label: string;
    /** The rail has no labels to fold a section from, so it shows them all. */
    isSidebarCollapsed: boolean;
    items: SidebarSectionItem[];
};

export const SidebarSection: FC<Props> = ({
    sectionKey,
    label,
    isSidebarCollapsed,
    items,
}) => {
    const [foldedSections, setFoldedSections] = useLocalStorage<string[]>({
        key: FOLDED_SECTIONS_STORAGE_KEY,
        defaultValue: [],
        getInitialValueInEffect: false,
    });
    const isFolded = foldedSections.includes(sectionKey);
    const isOpen = isSidebarCollapsed || !isFolded;

    return (
        <Box>
            <UnstyledButton
                className={clsx(classes.sectionLabel, classes.sectionToggle)}
                aria-expanded={isOpen}
                data-folded={isFolded}
                tabIndex={isSidebarCollapsed ? -1 : undefined}
                onClick={() =>
                    setFoldedSections((folded) =>
                        folded.includes(sectionKey)
                            ? folded.filter((key) => key !== sectionKey)
                            : [...folded, sectionKey],
                    )
                }
            >
                {label}
                <MantineIcon
                    icon={IconChevronDown}
                    size={12}
                    className={classes.sectionChevron}
                />
            </UnstyledButton>
            {items.map((item) => (
                <Collapse
                    key={item.key}
                    expanded={isOpen || item.isActive}
                    transitionDuration={150}
                >
                    {item.element}
                </Collapse>
            ))}
        </Box>
    );
};
