import { Button } from '@mantine-8/core';
import classes from './ThemeSwitcher.module.css';
import { ThemeToggleIcon } from './ThemeToggleIcon';
import { useThemeToggle } from './useThemeToggle';

export const ThemeSwitcher = () => {
    const { isDark, handleThemeToggle } = useThemeToggle();

    return (
        <Button
            variant="default"
            size="xs"
            p={0}
            px="md"
            onClick={handleThemeToggle}
            className={classes.themeToggle}
        >
            <ThemeToggleIcon isDark={isDark} />
        </Button>
    );
};
