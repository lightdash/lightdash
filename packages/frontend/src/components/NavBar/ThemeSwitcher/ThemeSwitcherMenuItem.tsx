import { Group, Menu, SegmentedControl } from '@mantine/core';
import { IconBrightness } from '@tabler/icons-react';
import {
    isColorSchemePreference,
    type ColorSchemePreference,
} from '../../../theme';
import MantineIcon from '../../common/MantineIcon';
import { useNavLayout } from '../NavLayoutContext';
import { useThemePreference } from './useThemePreference';

const THEME_OPTIONS: { value: ColorSchemePreference; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
];

export const ThemeSwitcherMenuItem = () => {
    const { colorSchemePreference, handleThemeChange } = useThemePreference();
    const isInSidebar = useNavLayout().layout === 'sidebar';

    return (
        <>
            <Group px="xs" py={isInSidebar ? 4 : 'xs'} gap="xs" wrap="nowrap">
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
