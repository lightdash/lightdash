import { FeatureFlags } from '@lightdash/common';
import { Anchor, Group, HoverCard, Stack, Text } from '@mantine-8/core';
// Using button from mantine/core so it groups nicely with other elements in navbar
import { Button, useMantineColorScheme } from '@mantine/core';
import { IconMoonStars, IconSun } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { type FC } from 'react';
import { BetaBadge } from '../common/BetaBadge';
import MantineIcon from '../common/MantineIcon';

const githubIssueUrl =
    'https://github.com/lightdash/lightdash/issues/new?' +
    'template=bug_report.yml&' +
    'labels=%F0%9F%8C%92%20dark%20theme';

export const ThemeSwitcher: FC<{}> = ({}) => {
    const isDarkModeEnabled = useFeatureFlagEnabled(FeatureFlags.DarkMode);
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();

    if (!isDarkModeEnabled) return null;

    return (
        <HoverCard width={280} shadow="md" openDelay={400} withArrow>
            <HoverCard.Target>
                <Button
                    variant="default"
                    size="xs"
                    onClick={() => toggleColorScheme()}
                >
                    <MantineIcon
                        icon={colorScheme === 'dark' ? IconSun : IconMoonStars}
                    />
                </Button>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Stack gap="sm">
                    <Group gap="xs">
                        <Text fw={600} size="sm">
                            Dark mode
                        </Text>
                        <BetaBadge />
                    </Group>
                    <Text size="xs" c="dimmed">
                        Dark mode is currently in beta. If you encounter any
                        visual issues or bugs, please help us improve by
                        reporting them.
                    </Text>
                    <Anchor
                        href={githubIssueUrl}
                        target="_blank"
                        size="xs"
                        fw={500}
                    >
                        Report an issue →
                    </Anchor>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
