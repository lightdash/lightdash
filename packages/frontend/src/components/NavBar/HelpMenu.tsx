import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { Button, getDefaultZIndex, Menu } from '@mantine/core';
import { modals } from '@mantine/modals';
import {
    IconBook,
    IconHelp,
    IconMessages,
    IconRoad,
    IconSos,
    IconUsers,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import useHealth from '../../hooks/health/useHealth';
import useApp from '../../providers/App/useApp';
import SupportDrawerContent from '../../providers/SupportDrawer/SupportDrawerContent';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';

const HelpMenu: FC = () => {
    const health = useHealth();
    const { user } = useApp();
    const canViewRoadmap = user.data?.ability.can(
        'view',
        subject('Roadmap', {
            organizationUuid: user.data.organizationUuid,
        }),
    );
    const isCloudCustomer = health.data?.mode === LightdashMode.CLOUD_BETA;
    const isDevelopment = health.data?.mode === LightdashMode.DEV;

    const { show: showIntercom } = useIntercom();

    const helpMenuUrl = health.data?.helpMenuUrl;

    // If helpMenuUrl is set, render a button that opens the URL in a new tab
    if (helpMenuUrl) {
        return (
            <Button
                aria-label="Help"
                variant="default"
                size="xs"
                component="a"
                href={helpMenuUrl}
                target="_blank"
                rel="noopener noreferrer"
            >
                <MantineIcon icon={IconHelp} />
            </Button>
        );
    }

    return (
        <Menu
            withArrow
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            portalProps={{ target: '#navbar-header' }}
        >
            <Menu.Target>
                <Button aria-label="Help" variant="default" size="xs">
                    <MantineIcon icon={IconHelp} />
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <LargeMenuItem
                    component="a"
                    href="https://docs.lightdash.com/"
                    target="_blank"
                    title="Ask the docs"
                    description="Chat with the Lightdash docs AI assistant"
                    icon={IconBook}
                />

                {canViewRoadmap && (
                    <LargeMenuItem
                        component={Link}
                        to="/generalSettings/roadmap"
                        title="Roadmap"
                        description="Explore what we're building and track feature requests"
                        icon={IconRoad}
                    />
                )}

                {isCloudCustomer && (
                    <LargeMenuItem
                        onClick={() => {
                            // @ts-ignore
                            if (window.Pylon) {
                                // @ts-ignore
                                window.Pylon('show');
                            } else {
                                showIntercom();
                            }
                        }}
                        title="Talk to support"
                        description="Drop us a message with product questions or feedback"
                        icon={IconMessages}
                    />
                )}

                <LargeMenuItem
                    component="a"
                    href="https://join.slack.com/t/lightdash-community/shared_invite/zt-2wgtavou8-VRhwXI%7EQbjCAHQs0WBac3w"
                    target="_blank"
                    title="Join the Slack community"
                    description="Get advice share best practices with other users."
                    icon={IconUsers}
                />

                {(isCloudCustomer || isDevelopment) && (
                    <LargeMenuItem
                        component="a"
                        onClick={() => {
                            modals.open({
                                id: 'support-drawer',
                                title: 'Share with Lightdash Support',
                                size: 'lg',
                                children: <SupportDrawerContent />,
                                yOffset: 100,
                                zIndex: 1000,
                            });
                        }}
                        title="Report an issue"
                        description="Share a detailed report with Lightdash support"
                        icon={IconSos}
                    />
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default HelpMenu;
