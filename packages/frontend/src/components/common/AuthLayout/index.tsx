import { Box, Card, Stack, Text, Title } from '@mantine/core';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import LightdashLogo from '../../LightdashLogo/LightdashLogo';
import PageSpinner from '../../PageSpinner';
import { DocumentTitle } from '../DocumentTitle';
import classes from './AuthLayout.module.css';
import BrandShowcase from './BrandShowcase';
import LightdashWordmark from './LightdashWordmark';
import PixelBlocks from './PixelBlocks';
import { useAuthLayoutVariant } from './useAuthLayoutVariant';

type Props = {
    /** Document title, matching what each page passed to `Page` before. */
    pageTitle: string;
    /** Split-layout heading. Omitted when the page renders its own heading. */
    title?: string;
    subtitle?: string;
    /** Centred heading inside the legacy card. */
    legacyTitle?: string;
    /** Bounds the form in both layouts, for `SCREENSHOT_SELECTORS.LOGIN_PAGE`. */
    cardId?: string;
    /** Pages that bring their own cards (Invite) opt out of the legacy card. */
    withLegacyCard?: boolean;
    footer?: ReactNode;
};

const AuthLayout: FC<PropsWithChildren<Props>> = ({
    pageTitle,
    title,
    subtitle,
    legacyTitle,
    cardId,
    withLegacyCard = true,
    footer,
    children,
}) => {
    const { isNewLayout, isInitialLoading } = useAuthLayoutVariant();

    if (isInitialLoading) {
        return <PageSpinner />;
    }

    if (!isNewLayout) {
        return (
            <>
                <DocumentTitle title={pageTitle} />

                <Box className={classes.legacyRoot}>
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
        <>
            <DocumentTitle title={pageTitle} />

            <Box className={classes.root}>
                <Box className={classes.brandPanel}>
                    <LightdashWordmark className={classes.brandWordmark} />

                    <Stack gap="lg" className={classes.brandIntro}>
                        <Title
                            order={1}
                            fz="display"
                            className={classes.headline}
                        >
                            Analytics at the speed of code.
                        </Title>
                        <Text fz="lg" className={classes.subcopy}>
                            The only open-source, AI-native BI platform that
                            lets AI build, refactor, and ship analytics in
                            minutes.
                        </Text>
                    </Stack>

                    <Box className={classes.brandScene}>
                        <BrandShowcase />
                    </Box>

                    <PixelBlocks />
                </Box>

                <Box className={classes.formPanel}>
                    <Stack id={cardId} className={classes.formContent} gap="xl">
                        <LightdashWordmark className={classes.formWordmark} />
                        {title && (
                            <Stack gap="xs">
                                <Title order={2} className={classes.formTitle}>
                                    {title}
                                </Title>
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
        </>
    );
};

export default AuthLayout;
