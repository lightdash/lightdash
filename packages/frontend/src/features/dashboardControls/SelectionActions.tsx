import { type DashboardControlSection } from '@lightdash/common';
import { Button, Menu, Text } from '@mantine/core';
import { IconFolderPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';

export type SelectionActionsProps = {
    count: number;
    /** Each section with how many filters it holds. */
    sections: (DashboardControlSection & { count: number })[];
    /** Null takes the selected filters out of their sections. */
    onMove: (sectionId: string | null) => void;
    /** Names a new section, then moves the selection into it. */
    onMoveToNewSection: () => void;
    onRemove: () => void;
};

// "Move to" and the two-click "Remove" over selected filters, on the bar's
// selection bar
export const SelectionActions: FC<SelectionActionsProps> = ({
    count,
    sections,
    onMove,
    onMoveToNewSection,
    onRemove,
}) => {
    const getUiString = useUiStrings();
    // The first click arms "Remove", the second removes; Escape or leaving disarms
    const [isRemoveArmed, setIsRemoveArmed] = useState(false);
    return (
        <>
            {/* Focus must stay on the name input New section opens */}
            <Menu position="top" returnFocus={false}>
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
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={
                            <MantineIcon icon={IconFolderPlus} size={14} />
                        }
                        onClick={onMoveToNewSection}
                    >
                        New section
                    </Menu.Item>
                    <Menu.Divider />
                    {sections.map((section) => (
                        <Menu.Item
                            key={section.id}
                            onClick={() => onMove(section.id)}
                        >
                            {section.name ||
                                getUiString('filters.rail.untitledSection')}
                            <Text span inherit c="dimmed">
                                {` · ${section.count}`}
                            </Text>
                        </Menu.Item>
                    ))}
                    {sections.length > 0 && <Menu.Divider />}
                    <Menu.Item onClick={() => onMove(null)}>
                        No section
                    </Menu.Item>
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
                    ? `Remove ${count} ${count === 1 ? 'filter' : 'filters'}`
                    : 'Remove'}
            </Button>
        </>
    );
};
