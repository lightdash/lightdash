import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAccount } from '../../../hooks/user/useAccount';
import { useAppColorScheme } from '../../../providers/ColorSchemeContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { type ColorSchemePreference } from '../../../theme';
import { EventName } from '../../../types/Events';

export const useThemeToggle = () => {
    const { data: account } = useAccount();
    const { organizationUuid } = account?.organization || {};
    const projectUuid = useProjectUuid();

    const { colorSchemePreference, setColorSchemePreference } =
        useAppColorScheme();
    const { track } = useTracking();

    const handleThemeChange = (preference: ColorSchemePreference) => {
        if (organizationUuid && account && projectUuid) {
            track({
                name: EventName.THEME_TOGGLED,
                properties: {
                    userId: account.user.id,
                    projectId: projectUuid,
                    organizationId: organizationUuid,
                    to: preference,
                },
            });
        }

        setColorSchemePreference(preference);
    };

    return { colorSchemePreference, handleThemeChange };
};
