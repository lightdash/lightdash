import { useMantineColorScheme } from '@mantine/core';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAccount } from '../../../hooks/user/useAccount';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

export const useThemeToggle = () => {
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

    return { isDark, handleThemeToggle };
};
