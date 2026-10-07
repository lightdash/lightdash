import { Box, Card, Stack, Text, Title } from '@mantine/core';
import { clsx } from 'clsx';
import {
    useCallback,
    useMemo,
    useRef,
    type FC,
    type FocusEvent,
    type FormEvent,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import LightdashLogo from '../../LightdashLogo/LightdashLogo';
import PageSpinner from '../../PageSpinner';
import { DocumentTitle } from '../DocumentTitle';
import classes from './AuthLayout.module.css';
import { AuthPanelContext } from './AuthPanelContext';
import CustomerLogos from './CustomerLogos';
import LightdashWordmark from './LightdashWordmark';
import ListeningBlocks from './ListeningBlocks';
import { useAuthLayoutVariant } from './useAuthLayoutVariant';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isEmailInput = (target: EventTarget): target is HTMLInputElement =>
    target instanceof HTMLInputElement &&
    (target.type === 'email' || target.name === 'email');

const lightCellsByProgress = (panel: HTMLElement, progress: number) => {
    const cells = [...panel.querySelectorAll<HTMLElement>('[data-order]')];
    const steps =
        Math.max(0, ...cells.map((cell) => Number(cell.dataset.order))) + 1;
    cells.forEach((cell) => {
        cell.dataset.lit = String(
            Number(cell.dataset.order) < progress * steps,
        );
    });
};

type Props = {
    /** Document title, matching what each page passed to `Page` before. */
    pageTitle: string;
    /** Split-layout heading. Omitted when the page renders its own heading. */
    title?: string;
    subtitle?: ReactNode;
    /** Centred heading inside the legacy card. */
    legacyTitle?: string;
    /** Bounds the form in both layouts, for `SCREENSHOT_SELECTORS.LOGIN_PAGE`. */
    cardId?: string;
    /** Pages that bring their own cards (Invite) opt out of the legacy card. */
    withLegacyCard?: boolean;
    /** Shows customer logos on the brand panel in the split layout. */
    withCustomerLogos?: boolean;
    withPinkBackground?: boolean;
    footer?: ReactNode;
};

const AuthLayout: FC<PropsWithChildren<Props>> = ({
    pageTitle,
    title,
    subtitle,
    legacyTitle,
    cardId,
    withLegacyCard = true,
    withCustomerLogos = false,
    withPinkBackground = false,
    footer,
    children,
}) => {
    const { isNewLayout, isInitialLoading } = useAuthLayoutVariant();
    const brandPanelRef = useRef<HTMLDivElement>(null);

    const flashError = useCallback(() => {
        const panel = brandPanelRef.current;
        if (!panel) return;
        panel.dataset.stage = 'idle';
        void panel.offsetWidth;
        panel.dataset.stage = 'error';
    }, []);
    const startChecking = useCallback(() => {
        const panel = brandPanelRef.current;
        if (!panel) return;
        lightCellsByProgress(panel, 1);
        panel.dataset.stage = 'checking';
    }, []);
    const authPanel = useMemo(
        () => ({ startChecking, flashError }),
        [startChecking, flashError],
    );

    const handleFormFocus = (event: FocusEvent<HTMLDivElement>) => {
        const panel = brandPanelRef.current;
        if (!panel || !(event.target instanceof HTMLInputElement)) return;
        if (panel.dataset.stage === 'valid') return;
        panel.dataset.stage = 'focus';
    };

    const syncCodeProgress = (target: EventTarget) => {
        const panel = brandPanelRef.current;
        if (!panel || !(target instanceof HTMLElement)) return;
        const group = target.closest<HTMLElement>('[data-auth-progress]');
        if (!group) return;
        requestAnimationFrame(() => {
            const inputs = [...group.querySelectorAll('input')];
            const filled = inputs.filter((input) => input.value !== '').length;
            if (filled < inputs.length) panel.dataset.stage = 'typing';
            lightCellsByProgress(
                panel,
                inputs.length > 0 ? filled / inputs.length : 0,
            );
        });
    };

    const handleFormInput = (event: FormEvent<HTMLDivElement>) => {
        syncCodeProgress(event.target);
        const panel = brandPanelRef.current;
        if (!panel || !isEmailInput(event.target)) return;
        panel.dataset.stage = EMAIL_PATTERN.test(event.target.value)
            ? 'valid'
            : 'typing';
        const { length } = event.target.value;
        panel.querySelectorAll<HTMLElement>('[data-order]').forEach((cell) => {
            cell.dataset.lit = String(Number(cell.dataset.order) < length);
        });
    };

    const handleFormSubmit = () => {
        const panel = brandPanelRef.current;
        if (panel) panel.dataset.stage = 'submitting';
    };

    if (isInitialLoading) {
        return <PageSpinner />;
    }

    if (!isNewLayout) {
        return (
            <>
                <DocumentTitle title={pageTitle} />

                <Box
                    className={clsx(
                        classes.legacyRoot,
                        withPinkBackground && classes.pinkBackground,
                    )}
                >
                    <Stack className={classes.legacyContent}>
                        <Box mx="auto" my="lg">
                            <LightdashLogo />
                        </Box>
                        {withLegacyCard ? (
                            <Card id={cardId} p="xl" radius="md">
                                {legacyTitle && (
                                    <Title order={3} ta="center" mb="md">
                                        {legacyTitle}
                                    </Title>
                                )}
                                {children}
                            </Card>
                        ) : (
                            children
                        )}
                        {footer}
                    </Stack>
                </Box>
            </>
        );
    }

    return (
        <AuthPanelContext.Provider value={authPanel}>
            <DocumentTitle title={pageTitle} />

            <Box className={classes.root}>
                <Box
                    ref={brandPanelRef}
                    className={classes.brandPanel}
                    data-stage="idle"
                >
                    <LightdashWordmark className={classes.brandWordmark} />

                    <Stack gap="lg" className={classes.brandIntro}>
                        <Title order={1} className={classes.headline}>
                            Analytics at the speed of code.
                        </Title>
                        <Text className={classes.subcopy}>
                            The only open-source, AI-native BI platform that
                            lets AI build, refactor, and ship analytics in
                            minutes.
                        </Text>
                        {withCustomerLogos && <CustomerLogos />}
                    </Stack>

                    <ListeningBlocks />
                </Box>

                <Box
                    className={clsx(
                        classes.formPanel,
                        withPinkBackground && classes.pinkBackground,
                    )}
                    onFocusCapture={handleFormFocus}
                    onInputCapture={handleFormInput}
                    onSubmitCapture={handleFormSubmit}
                    onKeyUpCapture={(event) => syncCodeProgress(event.target)}
                >
                    <Stack id={cardId} className={classes.formContent} gap="xl">
                        <LightdashWordmark className={classes.formWordmark} />
                        {title && (
                            <Stack gap="xs">
                                <Title order={2}>{title}</Title>
                                {subtitle && (
                                    <Text className={classes.formSubtitle}>
                                        {subtitle}
                                    </Text>
                                )}
                            </Stack>
                        )}
                        {children}
                        {footer}
                    </Stack>
                </Box>
            </Box>
        </AuthPanelContext.Provider>
    );
};

export default AuthLayout;
