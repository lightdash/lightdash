import { Menu, Text, UnstyledButton } from '@mantine/core';
import { IconFilterPlus, IconFolderPlus, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';
import { RAIL_ADD_SELECTOR } from './railSelectors';

type Props = {
    /** Null while no filter can be added. */
    onAddFilter: (() => void) | null;
    /** Null for a viewer, whose rail has no sections. */
    onNewSection: (() => void) | null;
};

// The list's last row: an editor's opens "Add filter" and "New section", a
// viewer's adds a filter at once. It carries `data-controls-new-section`, so
// focus falls back to it after a remove or a dropped new section
export const AddRow: FC<Props> = ({ onAddFilter, onNewSection }) => {
    const getUiString = useUiStrings();
    if (onAddFilter === null && onNewSection === null) return null;
    if (onNewSection === null)
        return (
            <UnstyledButton
                className={classes.addRow}
                data-controls-new-section
                onClick={onAddFilter ?? undefined}
            >
                <MantineIcon icon={IconPlus} size={14} />
                <Text fz="xs" fw={500} inherit>
                    {getUiString('filters.addFilter')}
                </Text>
            </UnstyledButton>
        );
    // Escape leaves the menu with nothing focused; the name input and the
    // new filter's editor take focus before this runs
    const refocus = () =>
        setTimeout(() => {
            if (document.activeElement !== document.body) return;
            document.querySelector<HTMLElement>(RAIL_ADD_SELECTOR)?.focus();
        });
    return (
        <Menu position="bottom-start" returnFocus={false} onClose={refocus}>
            <Menu.Target>
                <UnstyledButton
                    className={classes.addRow}
                    data-controls-new-section
                >
                    <MantineIcon icon={IconPlus} size={14} />
                    <Text fz="xs" fw={500} inherit>
                        {getUiString('filters.rail.addFilterOrSection')}
                    </Text>
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
                {onAddFilter && (
                    <Menu.Item
                        fz="xs"
                        leftSection={
                            <MantineIcon icon={IconFilterPlus} size={14} />
                        }
                        onClick={onAddFilter}
                    >
                        {getUiString('filters.addFilter')}
                    </Menu.Item>
                )}
                <Menu.Item
                    fz="xs"
                    leftSection={
                        <MantineIcon icon={IconFolderPlus} size={14} />
                    }
                    onClick={onNewSection}
                >
                    New section
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
