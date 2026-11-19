import { type DashboardControlSection } from '@lightdash/common';
import { Button, Menu, Text } from '@mantine/core';
import { IconFolderPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { formatPickedCount } from './barSelection';
import editorClasses from './FilterEditor.module.css';
import { MENU_TRANSITION } from './menuTransition';

export type SelectionActionsProps = {
    /** Picked filter pills */
    filterCount: number;
    /** Picked parameter pills */
    parameterCount: number;
    /** Picked date zoom pills */
    dateZoomCount: number;
    /** Each section with how many pills it holds. */
    sections: (DashboardControlSection & { count: number })[];
    /** The section every selected pill is in, else null: "Move to" leaves it out. */
    sharedSectionId: string | null;
    /** Some selected pill is in a section: only then is "No section" a move. */
    isAnyInSection: boolean;
    /** Null takes the selected pills out of their sections. */
    onMove: (sectionId: string | null) => void;
    /** Names a new section, then moves the selection into it. */
    onMoveToNewSection: (source: 'selection_bar' | 'move_to_menu') => void;
    onRemove: () => void;
};

// "Move to new section", "Move to" and the two-click "Remove" over selected
// filters, on the bar's selection bar
export const SelectionActions: FC<SelectionActionsProps> = ({
    filterCount,
    parameterCount,
    dateZoomCount,
    sections,
    sharedSectionId,
    isAnyInSection,
    onMove,
    onMoveToNewSection,
    onRemove,
}) => {
    const getUiString = useUiStrings();
    const count = filterCount + parameterCount + dateZoomCount;
    // The first click arms "Remove", the second removes; Escape or leaving disarms
    const [isRemoveArmed, setIsRemoveArmed] = useState(false);
    const targets = sections.filter(
        (section) => section.id !== sharedSectionId,
    );
    return (
        <>
            <Button
                variant="light"
                size="xs"
                flex="0 0 auto"
                leftSection={<MantineIcon icon={IconFolderPlus} size={14} />}
                disabled={count === 0}
                onClick={() => onMoveToNewSection('selection_bar')}
            >
                Move to new section
            </Button>
            {/* Focus must stay on the name input New section opens */}
            <Menu
                position="top"
                withArrow
                offset={1}
                returnFocus={false}
                transitionProps={MENU_TRANSITION}
            >
                <Menu.Target>
                    <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        flex="0 0 auto"
                        disabled={count === 0}
                    >
                        Move to
                    </Button>
                </Menu.Target>
                <Menu.Dropdown className={editorClasses.menu}>
                    <Menu.Item
                        leftSection={
                            <MantineIcon icon={IconFolderPlus} size={14} />
                        }
                        onClick={() => onMoveToNewSection('move_to_menu')}
                    >
                        New section
                    </Menu.Item>
                    {targets.length > 0 && <Menu.Divider />}
                    {targets.map((section) => (
                        <Menu.Item
                            key={section.id}
                            onClick={() => onMove(section.id)}
                        >
                            {section.name ||
                                getUiString('controls.untitledSection')}
                            <Text span inherit c="dimmed">
                                {` · ${section.count}`}
                            </Text>
                        </Menu.Item>
                    ))}
                    {isAnyInSection && <Menu.Divider />}
                    {isAnyInSection && (
                        <Menu.Item onClick={() => onMove(null)}>
                            No section
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>
            <Button
                variant="subtle"
                color="red"
                size="xs"
                flex="0 0 auto"
                disabled={count === 0}
                aria-pressed={isRemoveArmed}
                data-own-escape={isRemoveArmed || undefined}
                onBlur={() => setIsRemoveArmed(false)}
                onMouseLeave={() => setIsRemoveArmed(false)}
                onKeyDown={(event) => {
                    if (event.key !== 'Escape' || !isRemoveArmed) return;
                    event.preventDefault();
                    setIsRemoveArmed(false);
                }}
                onClick={() => {
                    if (isRemoveArmed) onRemove();
                    else setIsRemoveArmed(true);
                }}
            >
                {isRemoveArmed
                    ? `Remove ${formatPickedCount(filterCount, parameterCount, dateZoomCount)}`
                    : 'Remove'}
            </Button>
        </>
    );
};
