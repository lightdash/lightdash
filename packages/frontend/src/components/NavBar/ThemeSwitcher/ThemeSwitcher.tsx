import { Button } from '@mantine-8/core';
import { clsx, useMantineColorScheme } from '@mantine/core';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAccount } from '../../../hooks/user/useAccount';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import classes from './ThemeSwitcher.module.css';

export const ThemeSwitcher = () => {
    const { data: account } = useAccount();
    const { organizationUuid } = account?.organization || {};
    const projectUuid = useProjectUuid();

    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const { track } = useTracking();

    const isDark = colorScheme === 'dark';

    const handleThemeToggle = () => {
        if (organizationUuid && account && projectUuid) {
            const newColorScheme = isDark ? 'light' : 'dark';

            track({
                name: EventName.THEME_TOGGLED,
                properties: {
                    userId: account.user.id,
                    projectId: projectUuid,
                    organizationId: organizationUuid,
                    to: newColorScheme,
                },
            });
        }

        toggleColorScheme();
    };

    return (
        <Button
            variant="default"
            size="xs"
            p={0}
            px="md"
            onClick={handleThemeToggle}
            className={classes.themeToggle}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                width="1em"
                height="1em"
                fill="currentColor"
                strokeLinecap="round"
                className={clsx(classes.themeToggleIcon, {
                    [classes.toggled]: !isDark,
                })}
                viewBox="0 0 32 32"
            >
                <clipPath id="theme-toggle-sun">
                    <path d="M0-5h30a1 1 0 0 0 9 13v24H0Z" />
                </clipPath>
                <g clipPath="url(#theme-toggle-sun)">
                    <circle cx="16" cy="16" r="9.34" />
                    <g stroke="currentColor" strokeWidth="1.5">
                        <path d="M16 5.5v-4" />
                        <path d="M16 30.5v-4" />
                        <path d="M1.5 16h4" />
                        <path d="M26.5 16h4" />
                        <path d="m23.4 8.6 2.8-2.8" />
                        <path d="m5.7 26.3 2.9-2.9" />
                        <path d="m5.8 5.8 2.8 2.8" />
                        <path d="m23.4 23.4 2.9 2.9" />
                    </g>
                </g>
            </svg>
        </Button>
    );
};
