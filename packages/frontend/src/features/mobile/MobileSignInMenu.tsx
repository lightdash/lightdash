import { FeatureFlags } from '@lightdash/common';
import {
    Button,
    getDefaultZIndex,
    Popover,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconDeviceMobile } from '@tabler/icons-react';
import { useId, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useNavBarMenuProps } from '../../components/NavBar/NavBarPortalContext';
import useHealth from '../../hooks/health/useHealth';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { getHost } from './mobileFormat';
import classes from './MobileSettingsPage.module.css';
import { MobileSignInStep } from './MobileSignInStep';
import { MOBILE_STRINGS } from './mobileStrings';
import { useMobileSignInCode } from './useMobileSignInCode';

const POPOVER_WIDTH = 'calc(min(420px, 100vw - 32px))';

const MobileSignInPopover: FC<{ withLabel: boolean }> = ({ withLabel }) => {
    const menuProps = useNavBarMenuProps();
    const { user } = useApp();
    const { data: health } = useHealth();
    const id = useId();
    const [opened, setOpened] = useState(false);
    const signIn = useMobileSignInCode({ autoShow: opened });
    const isConfirming = signIn.phase === 'claimed';

    const close = () => {
        setOpened(false);
        signIn.hide();
    };

    return (
        <Popover
            id={id}
            opened={opened}
            onChange={(next) => (next ? setOpened(true) : close())}
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
            width={menuProps.withinPortal ? POPOVER_WIDTH : 'target'}
            classNames={{ dropdown: classes.signInPopover }}
            zIndex={getDefaultZIndex('max')}
            trapFocus
            returnFocus
            closeOnEscape={!isConfirming}
            closeOnClickOutside={!isConfirming}
            {...menuProps}
        >
            <Popover.Target>
                <Tooltip
                    label={MOBILE_STRINGS.signInTitle}
                    position="bottom"
                    withinPortal
                    disabled={opened}
                >
                    <Button
                        id={id}
                        aria-label={MOBILE_STRINGS.signInTitle}
                        aria-haspopup="dialog"
                        aria-expanded={opened}
                        aria-controls={opened ? `${id}-dropdown` : undefined}
                        variant="default"
                        size="xs"
                        className={withLabel ? undefined : classes.headerButton}
                        onClick={() => (opened ? close() : setOpened(true))}
                    >
                        <MantineIcon icon={IconDeviceMobile} />
                        {withLabel && ` ${MOBILE_STRINGS.signInTitle}`}
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="sm">
                    <Title order={6}>{MOBILE_STRINGS.signInTitle}</Title>
                    <MobileSignInStep
                        signIn={signIn}
                        host={getHost(health?.siteUrl)}
                        email={user.data?.email}
                    />
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export const MobileSignInMenu: FC<{ withLabel?: boolean }> = ({
    withLabel = false,
}) => {
    const { data: qrSignInFlag } = useServerFeatureFlag(
        FeatureFlags.MobileQrSignIn,
    );
    if (!qrSignInFlag?.enabled) return null;
    return <MobileSignInPopover withLabel={withLabel} />;
};
