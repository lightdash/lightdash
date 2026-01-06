import { Button, Menu, Tooltip } from '@mantine-8/core';
import { IconLayoutDashboard, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useDashboardUIPreference } from '../../hooks/dashboard/useDashboardUIPreference';

/**
 * Button to switch to new UI - used in DashboardHeaderV1 (classic view)
 * Only shown when feature flag is OFF (allows users to opt-in)
 */
export const TryNewUIButton: FC = () => {
    const { setPreference, isDashboardRedesignFlagEnabled } =
        useDashboardUIPreference();

    // Don't show toggle if feature flag is enabled (users are forced to use new UI)
    if (isDashboardRedesignFlagEnabled) {
        return null;
    }

    const handleClick = () => {
        setPreference('v2');
    };

    return (
        <Tooltip
            label="We've made many improvements to the dashboard experience. Try it out and let us know what you think! You can always switch back to the classic view."
            withinPortal
            position="bottom"
        >
            <Button
                variant="light"
                size="compact-xs"
                color="violet"
                onClick={handleClick}
                fz="xs"
                leftSection={<MantineIcon icon={IconSparkles} />}
            >
                Try new Dashboard experience
            </Button>
        </Tooltip>
    );
};

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
        <Menu.Item
            leftSection={<MantineIcon icon={IconLayoutDashboard} />}
            onClick={handleClick}
        >
            Switch to classic view
        </Menu.Item>
    );
};
