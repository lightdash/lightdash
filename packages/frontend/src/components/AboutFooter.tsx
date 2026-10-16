import { LightdashMode } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Stack,
    Text,
} from '@mantine/core';
import { IconBook, IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import WhatsNewDrawer from '../ee/features/releaseHighlights/WhatsNewDrawer';
import useApp from '../providers/App/useApp';
import {
    TrackPage,
    TrackSection,
} from '../providers/Tracking/TrackingProvider';
import Logo from '../svgs/grey-icon-logo.svg?react';
import { PageName, PageType, SectionName } from '../types/Events';
import classes from './AboutFooter.module.css';
import MantineIcon from './common/MantineIcon';
import MantineLinkButton from './common/MantineLinkButton';
import MantineModal from './common/MantineModal';
import {
    FOOTER_HEIGHT,
    FOOTER_MARGIN,
    PAGE_CONTENT_WIDTH,
} from './common/Page/constants';

const AboutFooter: FC<{ minimal?: boolean; maxWidth?: number }> = ({
    minimal,
    maxWidth = PAGE_CONTENT_WIDTH,
}) => {
    const { t } = useTranslation('app');
    const [isOpen, setIsOpen] = useState(false);
    const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
    const { health: healthState } = useApp();
    const showUpdateBadge =
        healthState.data?.latest.version &&
        healthState.data.version !== healthState.data.latest.version &&
        healthState.data?.mode === LightdashMode.DEFAULT;
    // Cloud plans are per organization; the instance license says nothing about them
    const isCloud = healthState.data?.mode === LightdashMode.CLOUD_BETA;
    const licenseStatus = healthState.data?.license;
    const licenseDisplay = licenseStatus?.valid
        ? {
              badge: t('aboutFooter.license.valid'),
              color: 'green',
              description: t('aboutFooter.license.validDescription'),
          }
        : licenseStatus?.hasLicenseKey
          ? {
                badge: t('aboutFooter.license.invalid'),
                color: 'red',
                description: t('aboutFooter.license.invalidDescription'),
            }
          : {
                badge: t('aboutFooter.license.none'),
                color: 'gray',
                description: t('aboutFooter.license.noneDescription'),
            };

    const versionButton = (
        <Button
            variant={minimal ? 'transparent' : 'subtle'}
            color="ldGray.7"
            size="xs"
            fw="500"
            leftSection={<Logo />}
            loading={healthState.isInitialLoading}
            onClick={() => setIsOpen(true)}
        >
            {!minimal && t('aboutFooter.versionPrefix')}
            {healthState.data && `v${healthState.data.version}`}
        </Button>
    );

    return (
        <TrackSection name={SectionName.PAGE_FOOTER}>
            <Box
                mt={FOOTER_MARGIN}
                h={FOOTER_HEIGHT}
                component="footer"
                style={{ flexShrink: 0 }}
            >
                <Divider color="ldGray.2" w="100%" mb="-1px" />

                <Group
                    h="100%"
                    miw={0}
                    w="100%"
                    maw={maxWidth}
                    justify="space-between"
                    mx="auto"
                >
                    {showUpdateBadge ? (
                        <Group gap={0} wrap="nowrap">
                            {versionButton}
                            <Badge
                                component="button"
                                type="button"
                                ml="xs"
                                radius="xs"
                                size="xs"
                                className={classes.updateBadge}
                                aria-label={t('aboutFooter.newVersionAria')}
                                onClick={() => setIsWhatsNewOpen(true)}
                            >
                                {t('aboutFooter.newVersion')}
                            </Badge>
                        </Group>
                    ) : (
                        versionButton
                    )}

                    {minimal ? (
                        <Anchor
                            href="https://docs.lightdash.com/"
                            target="_blank"
                        >
                            <ActionIcon color="ldGray.7" size="md">
                                <MantineIcon
                                    icon={IconBook}
                                    size="sm"
                                    color="ldGray.7"
                                />
                            </ActionIcon>
                        </Anchor>
                    ) : (
                        <MantineLinkButton
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            leftSection={
                                <MantineIcon
                                    icon={IconBook}
                                    size="sm"
                                    color="ldGray.7"
                                />
                            }
                            variant="subtle"
                            color="ldGray.7"
                            size="xs"
                            fw="500"
                        >
                            {t('aboutFooter.documentation')}
                        </MantineLinkButton>
                    )}
                </Group>
            </Box>

            {showUpdateBadge && (
                <WhatsNewDrawer
                    opened={isWhatsNewOpen}
                    onClose={() => setIsWhatsNewOpen(false)}
                />
            )}

            <MantineModal
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                title={t('aboutFooter.aboutTitle')}
                icon={IconInfoCircle}
                size="md"
                modalBodyProps={{ py: 'lg' }}
            >
                <TrackPage
                    name={PageName.ABOUT_LIGHTDASH}
                    type={PageType.MODAL}
                >
                    <Stack gap="md">
                        <Text fz="sm" c="dimmed">
                            {isCloud
                                ? t('aboutFooter.instanceDetails')
                                : t('aboutFooter.instanceDetailsAndLicense')}
                        </Text>

                        <Paper radius="md" p="md">
                            <Stack gap="md">
                                <Group justify="space-between" wrap="nowrap">
                                    <Text fz="sm" c="dimmed">
                                        {t('aboutFooter.version')}
                                    </Text>
                                    <Text fz="sm" fw={600}>
                                        {healthState.data
                                            ? `v${healthState.data.version}`
                                            : t('aboutFooter.notAvailable')}
                                    </Text>
                                </Group>

                                {!isCloud && (
                                    <>
                                        <Divider />

                                        <Group
                                            justify="space-between"
                                            align="center"
                                            wrap="nowrap"
                                        >
                                            <Box>
                                                <Text fz="sm" fw={500}>
                                                    {t(
                                                        'aboutFooter.enterpriseLicense',
                                                    )}
                                                </Text>
                                                <Text fz="xs" c="dimmed">
                                                    {licenseDisplay.description}
                                                </Text>
                                            </Box>
                                            <Badge
                                                color={licenseDisplay.color}
                                                flex="none"
                                            >
                                                {licenseDisplay.badge}
                                            </Badge>
                                        </Group>
                                    </>
                                )}
                            </Stack>
                        </Paper>

                        <Group gap="xs">
                            <MantineLinkButton
                                href="https://docs.lightdash.com/"
                                target="_blank"
                                variant="subtle"
                                color="ldGray.7"
                                size="compact-sm"
                                leftSection={
                                    <MantineIcon icon={IconBook} size="sm" />
                                }
                            >
                                {t('aboutFooter.documentation')}
                            </MantineLinkButton>
                            <MantineLinkButton
                                href="https://github.com/lightdash/lightdash"
                                target="_blank"
                                variant="subtle"
                                color="ldGray.7"
                                size="compact-sm"
                                leftSection={
                                    <MantineIcon
                                        icon={IconBrandGithub}
                                        size="sm"
                                    />
                                }
                            >
                                GitHub
                            </MantineLinkButton>
                        </Group>
                    </Stack>
                </TrackPage>
            </MantineModal>
        </TrackSection>
    );
};

export default AboutFooter;
