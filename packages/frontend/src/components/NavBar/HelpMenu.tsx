import { LightdashMode } from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconBook,
    IconHelp,
    IconMessageCircle2,
    IconMessages,
    IconUsers,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useIntercom } from 'react-use-intercom';
import useHealth from '../../hooks/health/useHealth';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';

const HelpMenu: FC = () => {
    const health = useHealth();
    const isCloudCustomer = health.data?.mode === LightdashMode.CLOUD_BETA;

    const { show: showIntercom } = useIntercom();

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <Button aria-label="Help" variant="default" size="xs">
                    <MantineIcon icon={IconHelp} />
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
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
                        title="Contact support"
                        description="Drop us a message and we’ll get back to you asap!"
                        icon={IconMessages}
                    />
                )}

                <LargeMenuItem
                    component="a"
                    href={`${health.data?.siteHelpdeskUrl}`}
                    target="_blank"
                    title="View Docs"
                    description={`Learn how to deploy, use, contribute to ${health.data?.siteName}.`}
                    icon={IconBook}
                />

                <LargeMenuItem
                    component="a"
                    href={`${health.data?.siteSlackCommunityUrl}`}
                    target="_blank"
                    title="Join Slack community"
                    description="Get advice share best practices with other users."
                    icon={IconUsers}
                />

                <LargeMenuItem
                    component="a"
                    href={`${health.data?.siteGithubUrl}/issues/new/choose`}
                    target="_blank"
                    title={`Feedback on ${health.data?.siteName}`}
                    description={`Submit a feature request or bug report to improve ${health.data?.siteName}.`}
                    icon={IconMessageCircle2}
                />
            </Menu.Dropdown>
        </Menu>
    );
};

export default HelpMenu;
