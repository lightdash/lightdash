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
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import useHealth from '../../hooks/health/useHealth';
import useApp from '../../providers/App/useApp';
import SupportDrawerContent from '../../providers/SupportDrawer/SupportDrawerContent';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import { useNavBarMenuProps } from './NavBarPortalContext';

const HelpMenu: FC<{ withLabel?: boolean }> = ({ withLabel = false }) => {
    const { t } = useTranslation('navigation');
    const menuProps = useNavBarMenuProps();
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
                aria-label={t('help.label')}
                variant="default"
                size="xs"
                component="a"
                href={helpMenuUrl}
                target="_blank"
                rel="noopener noreferrer"
            >
                <MantineIcon icon={IconHelp} />
                {withLabel && ` ${t('help.label')}`}
            </Button>
        );
    }

    return (
        <Menu
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            {...menuProps}
        >
            <Menu.Target>
                <Button
                    aria-label={t('help.label')}
                    variant="default"
                    size="xs"
                >
                    <MantineIcon icon={IconHelp} />
                    {withLabel && ` ${t('help.label')}`}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <LargeMenuItem
                    component="a"
                    href="https://docs.lightdash.com/"
                    target="_blank"
                    title={t('help.docs.title')}
                    description={t('help.docs.description')}
                    icon={IconBook}
                />

                {canViewRoadmap && (
                    <LargeMenuItem
                        component={Link}
                        to="/generalSettings/roadmap"
                        title={t('help.roadmap.title')}
                        description={t('help.roadmap.description')}
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
                        title={t('help.support.title')}
                        description={t('help.support.description')}
                        icon={IconMessages}
                    />
                )}

                <LargeMenuItem
                    component="a"
                    href="https://join.slack.com/t/lightdash-community/shared_invite/zt-2wgtavou8-VRhwXI%7EQbjCAHQs0WBac3w"
                    target="_blank"
                    title={t('help.slack.title')}
                    description={t('help.slack.description')}
                    icon={IconUsers}
                />

                {(isCloudCustomer || isDevelopment) && (
                    <LargeMenuItem
                        component="a"
                        onClick={() => {
                            modals.open({
                                id: 'support-drawer',
                                title: t('help.report.modalTitle'),
                                size: 'lg',
                                children: <SupportDrawerContent />,
                                yOffset: 100,
                                zIndex: 1000,
                            });
                        }}
                        title={t('help.report.title')}
                        description={t('help.report.description')}
                        icon={IconSos}
                    />
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default HelpMenu;
