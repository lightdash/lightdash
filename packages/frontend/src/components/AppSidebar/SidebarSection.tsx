import { Box, Collapse, UnstyledButton } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { isScopeTourRunning } from '../../features/scopeTours/isScopeTourRunning';
import MantineIcon from '../common/MantineIcon';
import classes from './AppSidebar.module.css';

const FOLDED_SECTIONS_STORAGE_KEY = 'app-sidebar:folded-sections';

export type SidebarSectionItem = {
    key: string;
    /** The page being viewed stays in sight when its section is folded. */
    isActive: boolean;
    /** Added while the sidebar is on screen, so it opens into place. */
    animatesIn: boolean;
    element: ReactNode;
};

const SectionItem: FC<{ item: SidebarSectionItem; isSectionOpen: boolean }> = ({
    item,
    isSectionOpen,
}) => {
    const [hasEntered, setHasEntered] = useState(!item.animatesIn);
    useEffect(() => {
        // Opening starts from the closed state, which has to be painted first.
        const frame = requestAnimationFrame(() => setHasEntered(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <Collapse
            expanded={hasEntered && (isSectionOpen || item.isActive)}
            transitionDuration={hasEntered && item.animatesIn ? 200 : 150}
            transitionTimingFunction="cubic-bezier(0.23, 1, 0.32, 1)"
        >
            {item.element}
        </Collapse>
    );
};

type Props = {
    sectionKey: string;
    /** A section without a label has nothing to fold it from. */
    label: string | null;
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
    // A walkthrough points at rows by name, so none may be folded away.
    const isOpen =
        label === null ||
        isSidebarCollapsed ||
        !isFolded ||
        isScopeTourRunning();

    return (
        <Box>
            {label !== null && (
                <UnstyledButton
                    className={clsx(
                        classes.sectionLabel,
                        classes.sectionToggle,
                    )}
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
            )}
            {items.map((item) => (
                <SectionItem
                    key={item.key}
                    item={item}
                    isSectionOpen={isOpen}
                />
            ))}
        </Box>
    );
};
