import { Group, Menu, SegmentedControl } from '@mantine/core';
import { IconBrightness } from '@tabler/icons-react';
import {
    isColorSchemePreference,
    type ColorSchemePreference,
} from '../../../theme';
import MantineIcon from '../../common/MantineIcon';
import { useThemePreference } from './useThemePreference';

const THEME_OPTIONS: { value: ColorSchemePreference; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
];

export const ThemeSwitcherMenuItem = () => {
    const { colorSchemePreference, handleThemeChange } = useThemePreference();

    return (
        <>
            <Group p="xs" gap="xs" wrap="nowrap">
                <MantineIcon icon={IconBrightness} color="text" />
                <SegmentedControl
                    variant="raised"
                    size="xs"
                    fullWidth
                    aria-label="Theme"
                    value={colorSchemePreference}
                    onChange={(value) => {
                        if (isColorSchemePreference(value)) {
                            handleThemeChange(value);
                        }
                    }}
                    data={THEME_OPTIONS}
                />
            </Group>
            <Menu.Divider />
        </>
    );
};
