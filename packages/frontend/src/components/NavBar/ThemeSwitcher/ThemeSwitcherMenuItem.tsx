import { Menu } from '@mantine-8/core';
import { ThemeToggleIcon } from './ThemeToggleIcon';
import { useThemeToggle } from './useThemeToggle';

export const ThemeSwitcherMenuItem = () => {
    const { isDark, handleThemeToggle } = useThemeToggle();

    return (
        <Menu.Item
            role="menuitem"
            closeMenuOnClick={false}
            onClick={handleThemeToggle}
            leftSection={<ThemeToggleIcon isDark={isDark} />}
        >
            {isDark ? 'Light mode' : 'Dark mode'}
        </Menu.Item>
    );
};
