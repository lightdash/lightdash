import { FeatureFlags } from '@lightdash/common';
import {
    Button,
    getDefaultZIndex,
    Indicator,
    Popover,
    Title,
    type PopoverProps,
    Tooltip,
} from '@mantine/core';
import { IconDeviceMobile } from '@tabler/icons-react';
import {
    useEffect,
    useId,
    useRef,
    useState,
    type FC,
    type RefObject,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useNavBarMenuProps } from '../../components/NavBar/NavBarPortalContext';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { isSignInIdle } from './isSignInIdle';
import classes from './MobileSettingsPage.module.css';
import { useMobileSignInSeen } from './mobileSignInSeen';
import {
    MobileSignInDetails,
    MobileSignInQr,
    MobileSignInStatus,
    MobileSignInStep,
} from './MobileSignInStep';
import { MOBILE_STRINGS } from './mobileStrings';
import { PreviewQrPattern } from './PreviewQrPattern';
import { usePreviewSignIn, usePreviewSignInPhase } from './previewSignInState';
import {
    useMobileUpsell,
    type MobileUpsellChoice,
} from './upsell/getMobileUpsell';
import { MobileUpsellFrame } from './upsell/MobileUpsellFrame';
import {
    useMobileSignInCode,
    type MobileSignInPhase,
} from './useMobileSignInCode';

const POPOVER_WIDTH = 'calc(min(420px, 100vw - 32px))';
const PITCH_POPOVER_WIDTH = 'calc(min(508px, 100vw - 32px))';
const SCREEN_GUTTER = 16;

const fitInsideScreenGutter: Extract<
    NonNullable<PopoverProps['middlewares']>['size'],
    object
> = {
    apply: ({ elements }) => {
        const reference = elements.reference.getBoundingClientRect();
        const limit = document.documentElement.clientWidth - SCREEN_GUTTER;
        const overflow = Math.max(0, reference.right - limit);
        const width = Math.max(0, reference.width - 2 * overflow);
        elements.floating.style.width = `${width}px`;
    },
};

const hasLostFocus = () =>
    document.activeElement === null || document.activeElement === document.body;

const useKeepFocusInPopover = (
    phase: MobileSignInPhase,
    dropdown: RefObject<HTMLDivElement | null>,
) => {
    const wasConfirming = useRef(false);
    useEffect(() => {
        if (phase === 'claimed') {
            wasConfirming.current = true;
            return;
        }
        const shouldRefocus = wasConfirming.current || hasLostFocus();
        wasConfirming.current = false;
        const node = dropdown.current;
        if (node && shouldRefocus && !node.contains(document.activeElement)) {
            node.focus();
        }
    }, [phase, dropdown]);
};

const MobileSignInPopover: FC<{
    withLabel: boolean;
    upsell: MobileUpsellChoice | null;
}> = ({ withLabel, upsell }) => {
    const menuProps = useNavBarMenuProps();
    const id = useId();
    const [opened, setOpened] = useState(false);
    const { seen, markSeen } = useMobileSignInSeen();
    const preview = usePreviewSignInPhase();
    const liveSignIn = useMobileSignInCode({
        autoShow: opened && !preview.holdsMint,
    });
    const previewSignIn = usePreviewSignIn(preview.forced);
    const signIn = previewSignIn ?? liveSignIn;
    const isConfirming = signIn.phase === 'claimed';
    const qrPlaceholder = previewSignIn ? <PreviewQrPattern /> : undefined;
    const dropdown = useRef<HTMLDivElement>(null);
    useKeepFocusInPopover(signIn.phase, dropdown);

    const open = () => {
        setOpened(true);
        markSeen();
    };

    const close = () => {
        setOpened(false);
        liveSignIn.hide();
    };

    return (
        <Popover
            id={id}
            opened={opened}
            onChange={(next) => (next ? open() : close())}
            position={menuProps.withinPortal ? 'bottom-end' : 'bottom'}
            arrowOffset={16}
            offset={-2}
            width={
                menuProps.withinPortal
                    ? upsell
                        ? PITCH_POPOVER_WIDTH
                        : POPOVER_WIDTH
                    : undefined
            }
            middlewares={
                menuProps.withinPortal
                    ? undefined
                    : { size: fitInsideScreenGutter }
            }
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
                        classNames={{ label: classes.signInButtonLabel }}
                        onClick={() => (opened ? close() : open())}
                    >
                        <Indicator
                            size={12}
                            color="red"
                            offset={1}
                            disabled={seen}
                        >
                            <MantineIcon icon={IconDeviceMobile} />
                        </Indicator>
                        {withLabel && ` ${MOBILE_STRINGS.signInTitle}`}
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown ref={dropdown}>
                <MobileUpsellFrame
                    variation={upsell}
                    isIdle={isSignInIdle(signIn)}
                    title={
                        <Title order={6}>{MOBILE_STRINGS.signInTitle}</Title>
                    }
                    step={
                        <MobileSignInStep
                            signIn={signIn}
                            qrPlaceholder={qrPlaceholder}
                        />
                    }
                    qr={
                        <MobileSignInQr
                            signIn={signIn}
                            keepUsed
                            placeholder={qrPlaceholder}
                        />
                    }
                    details={<MobileSignInDetails signIn={signIn} />}
                    status={<MobileSignInStatus signIn={signIn} />}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export const MobileSignInMenu: FC<{ withLabel?: boolean }> = ({
    withLabel = false,
}) => {
    const upsell = useMobileUpsell();
    const { data: qrSignInFlag } = useServerFeatureFlag(
        FeatureFlags.MobileQrSignIn,
    );
    if (!qrSignInFlag?.enabled) return null;
    return <MobileSignInPopover withLabel={withLabel} upsell={upsell} />;
};
