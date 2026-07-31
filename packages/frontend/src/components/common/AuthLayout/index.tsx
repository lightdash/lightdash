import { Box, Card, Group, Stack, Text, Title } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import LightdashLogo from '../../LightdashLogo/LightdashLogo';
import PageSpinner from '../../PageSpinner';
import { DocumentTitle } from '../DocumentTitle';
import MantineIcon from '../MantineIcon';
import Page from '../Page/Page';
import classes from './AuthLayout.module.css';
import LightdashMark from './LightdashMark';
import { useAuthLayoutVariant } from './useAuthLayoutVariant';

const BRAND_HIGHLIGHTS = [
    'Agents build and refactor your dashboards',
    'Governed by your semantic layer — no hallucinations',
    'Open source · unlimited seats · no lock-in',
];

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
            <Page title={pageTitle} withCenteredContent withNavbar={false}>
                <Stack w={400} mt="4xl">
                    <Box mx="auto" my="lg">
                        <LightdashLogo />
                    </Box>
                    {withLegacyCard ? (
                        <Card
                            id={cardId}
                            p="xl"
                            radius="xs"
                            withBorder
                            shadow="xs"
                        >
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
            </Page>
        );
    }

    return (
        <>
            <DocumentTitle title={pageTitle} />

            <Box className={classes.root}>
                <Box className={classes.brandPanel}>
                    <Box className={classes.decorationTop} aria-hidden />
                    <Box className={classes.decorationBottom} aria-hidden />

                    <Group gap="sm" wrap="nowrap">
                        <Box className={classes.brandMark}>
                            <LightdashMark />
                        </Box>
                        <Text fz="xl" fw={600} className={classes.brandName}>
                            Lightdash
                        </Text>
                    </Group>

                    <Stack gap="4xl">
                        <Stack gap="lg">
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
                                minutes. Loved by developers.
                            </Text>
                        </Stack>

                        <Stack gap="md">
                            {BRAND_HIGHLIGHTS.map((highlight) => (
                                <Group key={highlight} gap="sm" wrap="nowrap">
                                    <MantineIcon
                                        icon={IconCheck}
                                        color="ldBrandViolet.3"
                                    />
                                    <Text className={classes.highlight}>
                                        {highlight}
                                    </Text>
                                </Group>
                            ))}
                        </Stack>
                    </Stack>

                    <Text fz="sm" className={classes.brandFooter}>
                        Open-source · unlimited seats · no lock-in
                    </Text>
                </Box>

                <Box className={classes.formPanel}>
                    <Stack id={cardId} className={classes.formContent} gap="xl">
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
        </>
    );
};

export default AuthLayout;
