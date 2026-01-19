import { Menu } from '@mantine-8/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useDashboardUIPreference } from '../../hooks/dashboard/useDashboardUIPreference';

/**
 * Menu item to switch to classic view - used in DashboardHeaderV2 (new view)
 * Only shown when feature flag is OFF (allows users to opt-out)
 */
export const SwitchToClassicMenuItem: FC = () => {
    const { setPreference, isDashboardRedesignFlagEnabled } =
        useDashboardUIPreference();

    // Don't show toggle if feature flag is enabled (users are forced to use new UI)
    if (isDashboardRedesignFlagEnabled) {
        return null;
    }

    const handleClick = () => {
        setPreference('v1');
    };

    return (
        <>
            <Menu.Divider />

            <Menu.Item
                leftSection={<MantineIcon icon={IconLayoutDashboard} />}
                onClick={handleClick}
            >
                Switch to classic view
            </Menu.Item>
        </>
    );
};
