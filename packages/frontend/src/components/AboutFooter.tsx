import { LightdashMode, type HealthState } from '@lightdash/common';
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
    Title,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconArrowUpRight,
    IconBook,
    IconBrandGithub,
    IconExternalLink,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useAmbientAiEnabled } from '../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import { useReleaseHighlights } from '../ee/features/releaseHighlights/useReleaseHighlights';
import useApp from '../providers/App/useApp';
import {
    TrackPage,
    TrackSection,
} from '../providers/Tracking/TrackingProvider';
import Logo from '../svgs/grey-icon-logo.svg?react';
import { PageName, PageType, SectionName } from '../types/Events';
import MantineIcon from './common/MantineIcon';
import MantineLinkButton from './common/MantineLinkButton';
import MantineModal from './common/MantineModal';
import {
    FOOTER_HEIGHT,
    FOOTER_MARGIN,
    PAGE_CONTENT_WIDTH,
} from './common/Page/constants';
import {
    getChangesSinceVersionUrl,
    RELEASE_NOTES_URL,
    UPDATE_LIGHTDASH_DOCS_URL,
} from './upgradeNoticeLinks';

const AboutUpdateNotice: FC<{
    currentVersion: string;
    latestVersion: string;
}> = ({ currentVersion, latestVersion }) => {
    const ambientAiEnabled = !!useAmbientAiEnabled();
    const query = useReleaseHighlights({ enabled: ambientAiEnabled });
    const requestedCount =
        ambientAiEnabled && !query.isError && query.data?.status === 'ready'
            ? query.data.highlights.filter(
                  (highlight) => highlight.requestedByYourOrganization,
              ).length
            : 0;

    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>v{latestVersion} is available</Title>
                <Text size="sm" c="dimmed">
                    {requestedCount > 0
                        ? `Includes ${requestedCount} ${requestedCount === 1 ? 'feature' : 'features'} your organization requested.`
                        : `See what changed since v${currentVersion} before you update.`}
                </Text>
                <Group gap="xs" wrap="wrap">
                    <Button
                        component="a"
                        href={UPDATE_LIGHTDASH_DOCS_URL}
                        target="_blank"
                        rel="noreferrer"
                        rightSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        How to update
                        <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Button>
                    {ambientAiEnabled && (
                        <Button
                            component="a"
                            href="/whats-new"
                            target="_blank"
                            rel="noreferrer"
                            variant="default"
                            rightSection={
                                <MantineIcon icon={IconArrowUpRight} />
                            }
                        >
                            See what's new
                            <VisuallyHidden>
                                {' '}
                                (opens in a new tab)
                            </VisuallyHidden>
                        </Button>
                    )}
                    <Button
                        component="a"
                        href={getChangesSinceVersionUrl(
                            currentVersion,
                            latestVersion,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        variant="subtle"
                        size="compact-sm"
                        rightSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        Changes since v{currentVersion}
                        <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Button>
                    <Button
                        component="a"
                        href={RELEASE_NOTES_URL}
                        target="_blank"
                        rel="noreferrer"
                        variant="subtle"
                        size="compact-sm"
                        rightSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        Release notes
                        <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};

const AboutInstanceDetails: FC<{
    health: HealthState | undefined;
    showUpdateBadge: boolean;
}> = ({ health, showUpdateBadge }) => {
    // Cloud plans are per organization; the instance license says nothing about them
    const isCloud = health?.mode === LightdashMode.CLOUD_BETA;
    const licenseStatus = health?.license;
    const licenseDisplay = licenseStatus?.valid
        ? {
              badge: 'Valid',
              color: 'green',
              description: 'Enterprise features are enabled.',
          }
        : licenseStatus?.hasLicenseKey
          ? {
                badge: 'Not valid',
                color: 'red',
                description: 'The configured license key is not valid.',
            }
          : {
                badge: 'No license',
                color: 'gray',
                description: 'No enterprise license key is configured.',
            };

    return (
        <>
            <Text fz="sm" c="dimmed">
                {isCloud
                    ? 'Instance details.'
                    : 'Instance details and licensing status.'}
            </Text>

            <Paper p="md">
                <Stack gap="md">
                    <Group justify="space-between" wrap="nowrap">
                        <Text fz="sm" c="dimmed">
                            Version
                        </Text>
                        <Group gap="xs">
                            <Text fz="sm" fw={600}>
                                {health ? `v${health.version}` : 'n/a'}
                            </Text>
                            {showUpdateBadge && (
                                <Badge size="xs" color="blue" variant="light">
                                    Update available
                                </Badge>
                            )}
                        </Group>
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
                                        Enterprise license
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        {licenseDisplay.description}
                                    </Text>
                                </Box>
                                <Badge color={licenseDisplay.color} flex="none">
                                    {licenseDisplay.badge}
                                </Badge>
                            </Group>
                        </>
                    )}
                </Stack>
            </Paper>
        </>
    );
};

const AboutFooter: FC<{ minimal?: boolean; maxWidth?: number }> = ({
    minimal,
    maxWidth = PAGE_CONTENT_WIDTH,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const { health: healthState } = useApp();
    const currentVersion = healthState.data?.version;
    const latestVersion = healthState.data?.latest.version;
    const showUpdateBadge =
        !!latestVersion &&
        currentVersion !== latestVersion &&
        healthState.data?.mode === LightdashMode.DEFAULT;

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
                    <Button
                        variant={minimal ? 'transparent' : 'subtle'}
                        color="ldGray.7"
                        size="xs"
                        fw="500"
                        leftSection={<Logo />}
                        loading={healthState.isInitialLoading}
                        onClick={() => setIsOpen(true)}
                    >
                        {!minimal && 'Lightdash - '}
                        {healthState.data && `v${healthState.data.version}`}
                        {showUpdateBadge && (
                            <Badge ml="xs" radius="xs" size="xs">
                                Update available
                            </Badge>
                        )}
                    </Button>

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
                            Documentation
                        </MantineLinkButton>
                    )}
                </Group>
            </Box>

            <MantineModal
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                title="About Lightdash"
                icon={IconInfoCircle}
                size="md"
                modalBodyProps={{ py: 'lg' }}
            >
                <TrackPage
                    name={PageName.ABOUT_LIGHTDASH}
                    type={PageType.MODAL}
                >
                    <Stack gap="md">
                        <AboutInstanceDetails
                            health={healthState.data}
                            showUpdateBadge={showUpdateBadge}
                        />

                        {showUpdateBadge && currentVersion && latestVersion && (
                            <AboutUpdateNotice
                                currentVersion={currentVersion}
                                latestVersion={latestVersion}
                            />
                        )}

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
                                Documentation
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
