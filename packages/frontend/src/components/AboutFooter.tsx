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
    Modal,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconBook, IconInfoCircle } from '@tabler/icons-react';
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
                        p="xs"
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
                                p="xs"
                                size="lg"
                                variant="subtle"
                            >
                                <MantineIcon
                                    icon={IconBook}
                                    size="lg"
                                    color="ldGray.7"
                                />
                            </ActionIcon>
                        </Anchor>
                    ) : (
                        <MantineLinkButton
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            leftIcon={
                                <MantineIcon
                                    icon={IconBook}
                                    size="lg"
                                    color="ldGray.7"
                                />
                            }
                            variant="light"
                            color="ldGray.7"
                            fw="500"
                            p="xs"
                        >
                            Documentation
                        </MantineLinkButton>
                    )}
                </Group>
            </Box>

            <Modal
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                title={
                    <Group align="center" justify="flex-start" gap="xs">
                        <IconInfoCircle size={17} color="gray" /> About
                        Lightdash
                    </Group>
                }
            >
                <TrackPage
                    name={PageName.ABOUT_LIGHTDASH}
                    type={PageType.MODAL}
                >
                    <Stack mx="xs">
                        <Title order={5} fw={500}>
                            <b>Version:</b>{' '}
                            {healthState.data
                                ? `v${healthState.data.version}`
                                : 'n/a'}
                        </Title>
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
                                        underline="always" // Required: link isn't differentiated from blue text without underline
                                    >
                                        How to update version
                                    </Anchor>{' '}
                                    documentation.
                                </Text>
                            </Alert>
                        )}

                        <Group justify="flex-end">
                            <MantineLinkButton
                                href="https://docs.lightdash.com/"
                                target="_blank"
                                variant="default"
                            >
                                Docs
                            </MantineLinkButton>
                            <MantineLinkButton
                                href="https://github.com/lightdash/lightdash"
                                target="_blank"
                                variant="default"
                            >
                                Github
                            </MantineLinkButton>
                        </Group>
                    </Stack>
                </TrackPage>
            </Modal>
        </TrackSection>
    );
};

export default AboutFooter;
