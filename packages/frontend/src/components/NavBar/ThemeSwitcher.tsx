import { FeatureFlags } from '@lightdash/common';
import { Tooltip } from '@mantine-8/core';
import { Button, useMantineColorScheme } from '@mantine/core';
import { IconMoonStars, IconSun } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

export const ThemeSwitcher: FC<{}> = ({}) => {
    const isDarkModeEnabled = useFeatureFlagEnabled(FeatureFlags.DarkMode);
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();

    if (!isDarkModeEnabled) return null;

    return (
        <Tooltip label={colorScheme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <Button
                variant="default"
                size="xs"
                onClick={() => toggleColorScheme()}
            >
                <MantineIcon
                    icon={colorScheme === 'dark' ? IconSun : IconMoonStars}
                />
            </Button>
        </Tooltip>
    );
};
