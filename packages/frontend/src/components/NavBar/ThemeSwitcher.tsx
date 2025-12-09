import '@theme-toggles/react/css/Classic.css';

import { Button, useMantineColorScheme } from '@mantine/core';
import { Classic } from '@theme-toggles/react';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useAccount } from '../../hooks/user/useAccount';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

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
            pt="3px"
            onClick={handleThemeToggle}
        >
            <Classic
                toggled={!isDark}
                onToggle={() => {}}
                duration={750}
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
                style={{
                    color: 'white',
                    fontSize: '16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    strokeWidth: 2,
                }}
            />
        </Button>
    );
};
