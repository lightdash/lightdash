import { Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ThemeToggleIcon } from './ThemeToggleIcon';
import { useThemeToggle } from './useThemeToggle';

export const ThemeSwitcherMenuItem = () => {
    const { t } = useTranslation('navigation');
    const { isDark, handleThemeToggle } = useThemeToggle();

    return (
        <Menu.Item
            role="menuitem"
            closeMenuOnClick={false}
            onClick={handleThemeToggle}
            leftSection={<ThemeToggleIcon isDark={isDark} />}
        >
            {isDark ? t('theme.lightMode') : t('theme.darkMode')}
        </Menu.Item>
    );
};
