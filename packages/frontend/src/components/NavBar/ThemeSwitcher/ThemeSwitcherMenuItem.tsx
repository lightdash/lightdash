import { Group, Menu, SegmentedControl } from '@mantine/core';
import { IconBrightness } from '@tabler/icons-react';
import { type ColorSchemePreference } from '../../../theme';
import MantineIcon from '../../common/MantineIcon';
import classes from './ThemeSwitcher.module.css';
import { useThemeToggle } from './useThemeToggle';

const OPTIONS: { value: ColorSchemePreference; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
];

const isPreference = (value: string): value is ColorSchemePreference =>
    OPTIONS.some((option) => option.value === value);

export const ThemeSwitcherMenuItem = () => {
    const { colorSchemePreference, handleThemeChange } = useThemeToggle();

    return (
        <>
            <Group p="xs" gap="xs" wrap="nowrap">
                <MantineIcon icon={IconBrightness} color="text" />
                <SegmentedControl
                    size="xs"
                    fullWidth
                    aria-label="Theme"
                    value={colorSchemePreference}
                    onChange={(value) => {
                        if (isPreference(value)) handleThemeChange(value);
                    }}
                    data={OPTIONS}
                    classNames={{
                        root: classes.switcherRoot,
                        indicator: classes.switcherIndicator,
                        label: classes.switcherLabel,
                    }}
                />
            </Group>
            <Menu.Divider />
        </>
    );
};
