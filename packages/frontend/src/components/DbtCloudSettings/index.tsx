import { NonIdealState } from '@blueprintjs/core';
import { CreateDbtCloudIntegration } from '@lightdash/common/dist/types/dbtCloud';
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
import { IconHelp } from '@tabler/icons-react';
import { FC } from 'react';
import { z } from 'zod';
import {
    useProjectDbtCloud,
    useProjectDbtCloudDeleteMutation,
    useProjectDbtCloudUpdateMutation,
} from '../../hooks/dbtCloud/useProjectDbtCloudSettings';
import MantineIcon from '../common/MantineIcon';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

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
                <NonIdealState
                    title={dbtCloudSettings.error.error.message}
                    icon="error"
                />
            ) : (
                <SettingsGridCard>
                    <div>
                        <Title order={4}>dbt cloud</Title>

                        <Text color="dimmed">
                            Connect Lightdash to your dbt Cloud account to start
                            consuming metrics from the dbt semantic layer and
                            using dbt jinja in your queries. To get started we
                            recommend following the{' '}
                            <Anchor href="https://docs.lightdash.com/guides/dbt-semantic-layer">
                                dbt cloud semantic layer guide
                            </Anchor>{' '}
                            in the Lightdash docs.
                        </Text>
                    </div>

                    <Stack>
                        <PasswordInput
                            {...form.getInputProps('serviceToken')}
                            label={
                                <Group display="inline-flex" spacing="xs">
                                    Service Token
                                    <Tooltip
                                        label="Service tokens can be found in your dbt Cloud account settings: https://cloud.getdbt.com/next/settings - token needs at least 'metadata only' permissions."
                                        multiline
                                    >
                                        <MantineIcon
                                            icon={IconHelp}
                                            color="gray.6"
                                        />
                                    </Tooltip>
                                </Group>
                            }
                            disabled={dbtCloudSettings.isLoading}
                            placeholder="Enter your token..."
                        />

                        <TextInput
                            {...form.getInputProps('metricsJobId')}
                            label={
                                <Group display="inline-flex" spacing="xs">
                                    Job ID
                                    <Tooltip
                                        label="Your Job ID can be found by clicking Deploy > Jobs in the top bar in dbt Cloud. The Job ID in is the number in the URL after /jobs/12345."
                                        multiline
                                    >
                                        <MantineIcon
                                            icon={IconHelp}
                                            color="gray.6"
                                        />
                                    </Tooltip>
                                </Group>
                            }
                            disabled={dbtCloudSettings.isLoading}
                        />

                        <Group ml="auto">
                            {dbtCloudSettings.data?.metricsJobId && (
                                <Button
                                    variant="default"
                                    onClick={() => handleClear()}
                                >
                                    Clear
                                </Button>
                            )}

                            <Button
                                type="submit"
                                loading={dbtCloudSettings.isLoading}
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
