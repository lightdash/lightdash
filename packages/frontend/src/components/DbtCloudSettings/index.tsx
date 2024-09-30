import { type CreateDbtCloudIntegration } from '@lightdash/common/dist/types/dbtCloud';
import {
    Anchor,
    Button,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconAlertCircle, IconHelp } from '@tabler/icons-react';
import { type FC } from 'react';
import { z } from 'zod';
import {
    useProjectDbtCloud,
    useProjectDbtCloudDeleteMutation,
    useProjectDbtCloudUpdateMutation,
} from '../../hooks/dbtCloud/useProjectDbtCloudSettings';
import MantineIcon from '../common/MantineIcon';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

interface DbtCloudSettingsProps {
    projectUuid: string;
}

const schema = z.object({
    serviceToken: z.string().nonempty({
        message: 'Service token is required',
    }),
    metricsJobId: z.string().nonempty({
        message: 'Job ID is required',
    }),
});

const DbtCloudSettings: FC<DbtCloudSettingsProps> = ({ projectUuid }) => {
    const form = useForm<CreateDbtCloudIntegration>({
        validate: zodResolver(schema),
        initialValues: {
            serviceToken: '',
            metricsJobId: '',
        },
    });
    const dbtCloudSettings = useProjectDbtCloud(projectUuid, {
        staleTime: 0,
        onSuccess: (data) => {
            form.setFieldValue('metricsJobId', data?.metricsJobId ?? '');
        },
    });
    const updateDbtCloud = useProjectDbtCloudUpdateMutation(projectUuid);
    const deletDbtCloud = useProjectDbtCloudDeleteMutation(projectUuid);

    const handleSubmit = (data: CreateDbtCloudIntegration) => {
        updateDbtCloud.mutate(data);
    };

    const handleClear = async () => {
        deletDbtCloud.mutate(undefined);
    };

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            {dbtCloudSettings.error ? (
                <SuboptimalState
                    title={dbtCloudSettings.error.error.message}
                    icon={IconAlertCircle}
                />
            ) : (
                <SettingsGridCard>
                    <Stack spacing="sm">
                        <Title order={4}>dbt Semantic Layer</Title>

                        <Text color="dimmed">
                            dbt Semantic Layer is available now in Lightdash
                            Cloud. To get setup, reach out to your Lightdash
                            support rep or email support@lightdash.com to have
                            this activated in your account.
                        </Text>
                        <Text color="dimmed">
                            Read more about using dbt Semantic Layer in our{' '}
                            <Anchor href="https://docs.lightdash.com/references/dbt-semantic-layer">
                                docs guide
                            </Anchor>
                        </Text>
                    </Stack>

                    <Stack>
                        <PasswordInput
                            {...form.getInputProps('serviceToken')}
                            label={
                                <Group display="inline-flex" spacing="xs">
                                    Service Token
                                    <Tooltip
                                        maw={400}
                                        label="Service tokens can be found in your dbt Cloud account settings: https://cloud.getdbt.com/next/settings - token needs at least 'semantic layer only' permissions."
                                        multiline
                                    >
                                        <MantineIcon
                                            icon={IconHelp}
                                            color="gray.6"
                                        />
                                    </Tooltip>
                                </Group>
                            }
                            readOnly
                            disabled
                        />

                        <TextInput
                            {...form.getInputProps('metricsJobId')}
                            label={
                                <Group display="inline-flex" spacing="xs">
                                    Environment ID
                                    <Tooltip
                                        maw={400}
                                        label="The unique identifier for the dbt production environment, you can retrieve this from the dbt Cloud URL when you navigate to Environments under Deploy. If your URL ends with .../environments/222222, your environmentId is 222222"
                                        multiline
                                    >
                                        <MantineIcon
                                            icon={IconHelp}
                                            color="gray.6"
                                        />
                                    </Tooltip>
                                </Group>
                            }
                            readOnly
                            disabled
                        />

                        <Group ml="auto">
                            {dbtCloudSettings.data?.metricsJobId && (
                                <Button
                                    disabled
                                    variant="default"
                                    onClick={() => handleClear()}
                                >
                                    Clear
                                </Button>
                            )}

                            <Button
                                type="submit"
                                disabled
                                loading={dbtCloudSettings.isInitialLoading}
                            >
                                Save
                            </Button>
                        </Group>
                    </Stack>
                </SettingsGridCard>
            )}
        </form>
    );
};

export default DbtCloudSettings;
