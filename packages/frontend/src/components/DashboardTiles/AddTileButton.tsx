import {
    Button,
    Group,
    Menu,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconInfoCircle, IconNewSection, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    toHotkeyItems,
    type EditShortcut,
} from '../common/Dashboard/editShortcuts';
import MantineIcon from '../common/MantineIcon';
import {
    useAddTileOptions,
    type AddTileOptionsArgs,
} from './useAddTileOptions';

type Props = AddTileOptionsArgs & {
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    /** Opens the menu from the keyboard; omitted where the button has no shortcut */
    shortcut?: EditShortcut;
} & Pick<ButtonProps, 'disabled' | 'radius'>;

const SAVED_CHART_TOUR_PROPS = {
    'data-tour-anchor': 'add-saved-chart',
    'data-tour-hint': 'Choose Saved chart',
};

const AddTileButton: FC<Props> = ({
    onAddTiles,
    setAddingTab,
    disabled,
    activeTabUuid,
    dashboardTabs,
    radius,
    allowedTileTypes,
    chartSpaceUuids,
    onNewChart,
    shortcut,
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    useHotkeys(
        shortcut && !disabled
            ? toHotkeyItems(shortcut, () => setIsMenuOpen((open) => !open))
            : [],
    );
    const {
        tileOptions,
        canAddTile,
        canAddTab,
        maxTilesPerTab,
        maxTabsPerDashboard,
        modals,
    } = useAddTileOptions({
        onAddTiles,
        activeTabUuid,
        dashboardTabs,
        allowedTileTypes,
        chartSpaceUuids,
        onNewChart,
    });
    const showTabs = !allowedTileTypes;
    const headingOption = tileOptions.find(({ id }) => id === 'heading');

    return (
        <>
            {canAddTile ? (
                <Menu
                    position="bottom"
                    withArrow
                    width={200}
                    opened={isMenuOpen}
                    onChange={setIsMenuOpen}
                >
                    <Menu.Target>
                        <Button
                            size="xs"
                            variant="default"
                            radius={radius}
                            disabled={disabled}
                            leftSection={<MantineIcon icon={IconPlus} />}
                            data-tour-anchor="add-tile"
                            data-tour-hint="Click Add tile"
                        >
                            Add tile
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Tiles</Menu.Label>
                        {tileOptions
                            .filter(({ id }) => id !== 'heading')
                            .map((option) => (
                                <Menu.Item
                                    key={option.id}
                                    onClick={option.onSelect}
                                    leftSection={
                                        <MantineIcon icon={option.icon} />
                                    }
                                    {...(option.id === 'savedChart'
                                        ? SAVED_CHART_TOUR_PROPS
                                        : {})}
                                >
                                    {option.hint === null ? (
                                        option.label
                                    ) : (
                                        <Group gap="xxs">
                                            <Text fz="sm">{option.label}</Text>
                                            <Tooltip label={option.hint}>
                                                <MantineIcon
                                                    icon={IconInfoCircle}
                                                    color="dimmed"
                                                />
                                            </Tooltip>
                                        </Group>
                                    )}
                                </Menu.Item>
                            ))}

                        {(showTabs || headingOption) && <Menu.Divider />}

                        {(showTabs || headingOption) && (
                            <Menu.Label>Elements</Menu.Label>
                        )}
                        {showTabs && (
                            <Menu.Item
                                onClick={() => setAddingTab(true)}
                                leftSection={
                                    <MantineIcon icon={IconNewSection} />
                                }
                            >
                                Tab
                            </Menu.Item>
                        )}

                        {headingOption && (
                            <Menu.Item
                                onClick={headingOption.onSelect}
                                leftSection={
                                    <MantineIcon icon={headingOption.icon} />
                                }
                            >
                                {headingOption.label}
                            </Menu.Item>
                        )}
                    </Menu.Dropdown>
                </Menu>
            ) : canAddTab ? (
                <Group gap="xs" wrap="nowrap">
                    <Tooltip
                        label={`This tab has reached the ${maxTilesPerTab}-tile limit. Add a new tab to continue adding tiles.`}
                    >
                        <span>
                            <Button
                                size="xs"
                                variant="default"
                                radius={radius}
                                disabled
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                Add tile
                            </Button>
                        </span>
                    </Tooltip>
                    <Button
                        size="xs"
                        variant="default"
                        radius={radius}
                        disabled={disabled}
                        onClick={() => setAddingTab(true)}
                        leftSection={<MantineIcon icon={IconNewSection} />}
                    >
                        Add tab
                    </Button>
                </Group>
            ) : (
                <Tooltip
                    label={`Maximum limits reached: ${maxTilesPerTab} tiles per tab, ${maxTabsPerDashboard} tabs per dashboard.`}
                >
                    <span>
                        <Button
                            size="xs"
                            variant="default"
                            radius={radius}
                            disabled
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            Add tile
                        </Button>
                    </span>
                </Tooltip>
            )}

            {modals}
        </>
    );
};

export default AddTileButton;
