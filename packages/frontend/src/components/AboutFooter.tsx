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
} from '@mantine-8/core';
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

const AboutFooter: FC<{ minimal?: boolean; maxWidth?: number }> = ({
    minimal,
    maxWidth = PAGE_CONTENT_WIDTH,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const { health: healthState } = useApp();
    const showUpdateBadge =
        healthState.data?.latest.version &&
        healthState.data.version !== healthState.data.latest.version &&
        healthState.data?.mode === LightdashMode.DEFAULT;
    const isLicenseValid = healthState.data?.license.valid ?? false;

    return (
        <TrackSection name={SectionName.PAGE_FOOTER}>
            <Box mt={FOOTER_MARGIN} h={FOOTER_HEIGHT} component="footer">
                <Divider color="ldGray.2" w="100%" mb="-1px" />

                <Group
                    h="100%"
                    miw={minimal ? '100%' : maxWidth}
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
                            <Badge
                                variant="light"
                                ml="xs"
                                radius="xs"
                                size="xs"
                            >
                                New version available!
                            </Badge>
                        )}
                    </Button>

                    {minimal ? (
                        <Anchor
                            href="https://docs.lightdash.com/"
                            target="_blank"
                        >
                            <ActionIcon
                                color="ldGray.7"
                                size="md"
                                variant="subtle"
                            >
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
                size="sm"
                modalBodyProps={{ py: 'lg' }}
            >
                <TrackPage
                    name={PageName.ABOUT_LIGHTDASH}
                    type={PageType.MODAL}
                >
                    <Stack gap="md">
                        <Text fz="sm" c="ldGray.6">
                            Instance details and licensing status.
                        </Text>

                        <Paper withBorder radius="md" p="md">
                            <Stack gap="md">
                                <Group justify="space-between" wrap="nowrap">
                                    <Text fz="sm" c="ldGray.6">
                                        Version
                                    </Text>
                                    <Text fz="sm" fw={600}>
                                        {healthState.data
                                            ? `v${healthState.data.version}`
                                            : 'n/a'}
                                    </Text>
                                </Group>

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
                                        <Text fz="xs" c="ldGray.6">
                                            {isLicenseValid
                                                ? 'Enterprise features are enabled.'
                                                : 'This instance has no enterprise license.'}
                                        </Text>
                                    </Box>
                                    <Badge
                                        color={
                                            isLicenseValid ? 'green' : 'gray'
                                        }
                                        variant="light"
                                        flex="none"
                                    >
                                        {isLicenseValid
                                            ? 'Valid'
                                            : 'No license'}
                                    </Badge>
                                </Group>
                            </Stack>
                        </Paper>

                        {showUpdateBadge && (
                            <Alert
                                title="New version available!"
                                color="blue"
                                icon={<IconInfoCircle size={17} />}
                            >
                                <Text c="blue">
                                    The version v
                                    {healthState.data?.latest.version} is now
                                    available. Please follow the instructions in
                                    the{' '}
                                    <Anchor
                                        href="https://docs.lightdash.com/self-host/update-lightdash"
                                        target="_blank"
                                        rel="noreferrer"
                                        underline="always"
                                    >
                                        How to update version
                                    </Anchor>{' '}
                                    documentation.
                                </Text>
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
