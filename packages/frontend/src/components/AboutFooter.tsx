import { LightdashMode } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    Badge,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconBook, IconInfoCircle, IconShare3 } from '@tabler/icons-react';
import React, { FC, useState } from 'react';
import { useApp } from '../providers/AppProvider';
import { TrackPage, TrackSection } from '../providers/TrackingProvider';
import { ReactComponent as Logo } from '../svgs/grey-icon-logo.svg';
import { PageName, PageType, SectionName } from '../types/Events';
import MantineLinkButton from './common/MantineLinkButton';

const AboutFooter: FC<{ minimal?: boolean; maxWidth?: number }> = ({
    minimal,
    maxWidth,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const { health: healthState } = useApp();
    const hasUpdate =
        healthState.data?.latest.version &&
        healthState.data.version !== healthState.data.latest.version;

    const isCloud = healthState.data?.mode === LightdashMode.CLOUD_BETA;

    return (
        <TrackSection name={SectionName.PAGE_FOOTER}>
            <Group
                w="100%"
                mt="lg"
                style={{
                    borderTop: '1px solid lightgray',
                }}
            >
                <Group
                    h={80}
                    miw={!minimal ? 900 : '100%'}
                    maw={maxWidth || 900}
                    position="apart"
                    align="center"
                    mx="auto"
                >
                    <Button
                        variant={minimal ? 'subtle' : 'light'}
                        color="gray.7"
                        p="xs"
                        fw="500"
                        leftIcon={<Logo />}
                        loading={healthState.isLoading}
                        onClick={() => setIsOpen(true)}
                    >
                        {!minimal && 'Lightdash - '}
                        {healthState.data && `v${healthState.data.version}`}
                        {hasUpdate && !isCloud && (
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
                            <ActionIcon color="gray.7" p="xs" size="lg">
                                <IconBook size={19} />
                            </ActionIcon>
                        </Anchor>
                    ) : (
                        <MantineLinkButton
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            leftIcon={<IconBook size={19} />}
                            variant="light"
                            color="gray.7"
                            fw="500"
                            p="xs"
                        >
                            Documentation
                        </MantineLinkButton>
                    )}
                </Group>
                <Modal
                    opened={isOpen}
                    onClose={() => setIsOpen(false)}
                    title={
                        <Group align="center" position="left" spacing="xs">
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
                            {hasUpdate && !isCloud && (
                                <Alert
                                    title="New version available!"
                                    color="blue"
                                    icon={<IconInfoCircle size={17} />}
                                >
                                    <Text color="blue">
                                        The version v
                                        {healthState.data?.latest.version} is
                                        now available. Please follow the
                                        instructions in the{' '}
                                        <Anchor
                                            href="https://docs.lightdash.com/self-host/update-lightdash"
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                                textDecoration: 'underline',
                                            }}
                                        >
                                            How to update version
                                        </Anchor>{' '}
                                        documentation.
                                    </Text>
                                </Alert>
                            )}

                            <Group position="right">
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
            </Group>
        </TrackSection>
    );
};

export default AboutFooter;
