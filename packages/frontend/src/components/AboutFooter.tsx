import { LightdashMode } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
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
    // Cloud plans are per organization; the instance license says nothing about them
    const isCloud = healthState.data?.mode === LightdashMode.CLOUD_BETA;
    const licenseStatus = healthState.data?.license;
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
                                New version available!
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
                        <Text fz="sm" c="dimmed">
                            {isCloud
                                ? 'Instance details.'
                                : 'Instance details and licensing status.'}
                        </Text>

                        <Paper radius="md" p="md">
                            <Stack gap="md">
                                <Group justify="space-between" wrap="nowrap">
                                    <Text fz="sm" c="dimmed">
                                        Version
                                    </Text>
                                    <Text fz="sm" fw={600}>
                                        {healthState.data
                                            ? `v${healthState.data.version}`
                                            : 'n/a'}
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
                                                    Enterprise license
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

                        {showUpdateBadge && currentVersion && latestVersion && (
                            <Alert
                                title="New version available!"
                                color="blue"
                                icon={<IconInfoCircle size={17} />}
                            >
                                <Stack gap="xs">
                                    <Text>
                                        The version v{latestVersion} is now
                                        available. Please follow the
                                        instructions in the{' '}
                                        <Anchor
                                            href={UPDATE_LIGHTDASH_DOCS_URL}
                                            target="_blank"
                                            rel="noreferrer"
                                            underline="always"
                                        >
                                            How to update version
                                        </Anchor>{' '}
                                        documentation.
                                    </Text>
                                    <Group gap="md">
                                        <Anchor
                                            href={getChangesSinceVersionUrl(
                                                currentVersion,
                                                latestVersion,
                                            )}
                                            target="_blank"
                                            rel="noreferrer"
                                            underline="always"
                                            fz="sm"
                                        >
                                            See what's changed since v
                                            {currentVersion}
                                        </Anchor>
                                        <Anchor
                                            href={RELEASE_NOTES_URL}
                                            target="_blank"
                                            rel="noreferrer"
                                            underline="always"
                                            fz="sm"
                                        >
                                            Release notes
                                        </Anchor>
                                    </Group>
                                </Stack>
                            </Alert>
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
