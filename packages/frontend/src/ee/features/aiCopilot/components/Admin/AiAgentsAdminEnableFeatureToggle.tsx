import {
    Badge,
    Group,
    HoverCard,
    List,
    Paper,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiOrganizationSettings,
    useUpdateAiOrganizationSettings,
} from '../../hooks/useAiOrganizationSettings';

type Props = {
    enabled: boolean | undefined;
};

export const AiAgentsAdminEnableFeatureToggle = ({ enabled }: Props) => {
    const { mutateAsync: updateAiOrganizationSettings, isLoading } =
        useUpdateAiOrganizationSettings();

    const organizationSettingsQuery = useAiOrganizationSettings();

    const isTrial =
        organizationSettingsQuery.isSuccess &&
        organizationSettingsQuery.data?.isTrial;

    return (
        <HoverCard>
            <HoverCard.Target>
                <Paper py="xs" px="sm">
                    <Switch
                        size="xs"
                        withThumbIndicator={false}
                        labelPosition="left"
                        label={
                            isTrial ? (
                                <Group gap="xs">
                                    <Badge
                                        leftSection={
                                            <MantineIcon
                                                icon={IconSparkles}
                                                size={12}
                                            />
                                        }
                                        radius="sm"
                                        variant="light"
                                        color="indigo"
                                        size="xs"
                                        tt="none"
                                        fw={500}
                                    >
                                        Free trial
                                    </Badge>
                                    <Text fw={500} fz="xs">
                                        Enable AI features for users
                                    </Text>
                                </Group>
                            ) : (
                                'Enable AI features for users'
                            )
                        }
                        checked={enabled}
                        onChange={(event) =>
                            updateAiOrganizationSettings({
                                aiAgentsVisible: event.currentTarget.checked,
                            })
                        }
                        disabled={isLoading || enabled == null}
                    />
                </Paper>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Stack gap="xs">
                    <Title order={6}>AI Features Control</Title>
                    <Text size="xs">
                        This toggle controls AI features across your entire
                        platform
                    </Text>
                    <Text size="xs" fw={600}>
                        When enabled:
                    </Text>
                    <List size="xs">
                        <List.Item>
                            AI features appear on the homepage
                        </List.Item>
                        <List.Item>
                            AI capabilities show in the navbar
                        </List.Item>
                        <List.Item>Users can interact with AI Agents</List.Item>
                        <List.Item>Admin can view and manage threads</List.Item>
                    </List>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
