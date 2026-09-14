import { Group, Stack, Text } from '@mantine/core';
import { IconMail } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useHealth from '../../../../../hooks/health/useHealth';
import GoogleChatSvg from '../../../../../svgs/googlechat.svg?react';
import MsTeamsSvg from '../../../../../svgs/msteams.svg?react';
import SlackSvg from '../../../../../svgs/slack.svg?react';
import { useSchedulerFormContext } from '../schedulerFormContext';
import { SchedulerFormEmailInput } from '../SchedulerFormEmailInput';
import { SchedulerFormGoogleChatInput } from '../SchedulerFormGoogleChatInput';
import { SchedulerFormMicrosoftTeamsInput } from '../SchedulerFormMicrosoftTeamsInput';
import { SchedulerFormSlackInput } from '../SchedulerFormSlackInput';

const SVG_SIZE = { width: 14, height: 14 } as const;

const Destination: FC<{
    icon: ReactNode;
    label: string;
    children: ReactNode;
}> = ({ icon, label, children }) => (
    <Stack gap={2}>
        <Group gap={6}>
            {icon}
            <Text size="sm" fw={500}>
                {label}
            </Text>
        </Group>
        {children}
    </Stack>
);

export const SchedulerRecipientsSection: FC = () => {
    const form = useSchedulerFormContext();
    const health = useHealth();

    return (
        <Stack gap="lg">
            <Destination
                icon={
                    <MantineIcon icon={IconMail} size="sm" color="ldGray.7" />
                }
                label="Email"
            >
                <SchedulerFormEmailInput
                    hideIcon
                    value={form.values.emailTargets || []}
                    onChange={(val) => form.setFieldValue('emailTargets', val)}
                />
            </Destination>

            <Destination icon={<SlackSvg style={SVG_SIZE} />} label="Slack">
                <SchedulerFormSlackInput
                    hideIcon
                    value={form.values.slackTargets}
                    onChange={(val) => form.setFieldValue('slackTargets', val)}
                />
            </Destination>

            {health.data?.hasMicrosoftTeams && (
                <Destination
                    icon={<MsTeamsSvg style={SVG_SIZE} />}
                    label="Microsoft Teams"
                >
                    <SchedulerFormMicrosoftTeamsInput
                        hideIcon
                        msTeamTargets={form.values.msTeamsTargets}
                        onChange={(val: string[]) =>
                            form.setFieldValue('msTeamsTargets', val)
                        }
                    />
                </Destination>
            )}

            <Destination
                icon={<GoogleChatSvg style={SVG_SIZE} />}
                label="Google Chat"
            >
                <SchedulerFormGoogleChatInput
                    hideIcon
                    googleChatTargets={form.values.googleChatTargets}
                    onChange={(val: string[]) =>
                        form.setFieldValue('googleChatTargets', val)
                    }
                />
            </Destination>
        </Stack>
    );
};
