import { type DashboardControlSection } from '@lightdash/common';
import { Button, Menu, Text, type MenuProps } from '@mantine/core';
import { IconFolderPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
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
export const SelectionActions: FC<
    SelectionActionsProps & { menuPosition: MenuProps['position'] }
> = ({
    count,
    sections,
    onMove,
    onMoveToNewSection,
    onRemove,
    menuPosition,
}) => {
    const getUiString = useUiStrings();
    return (
        <>
            {/* Focus must stay on the name input New section opens */}
            <Menu position={menuPosition} returnFocus={false}>
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
                        fz="xs"
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
                            fz="xs"
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
                    <Menu.Item fz="xs" onClick={() => onMove(null)}>
                        No section
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            <ConfirmDeleteButton
                size="sm"
                w="auto"
                px="xs"
                fz="xs"
                data-own-escape
                aria-label="Remove"
                tooltip={`Click again to remove ${count} ${
                    count === 1 ? 'filter' : 'filters'
                }`}
                disabled={count === 0}
                onConfirm={onRemove}
            >
                Remove
            </ConfirmDeleteButton>
        </>
    );
};
