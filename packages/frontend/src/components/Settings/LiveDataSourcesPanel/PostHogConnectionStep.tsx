import {
    Button,
    Group,
    PasswordInput,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { ConnectionTestResult } from '../../../features/externalConnections/components/ConnectionTestResult';
import { useTestConnectionConfig } from '../../../features/externalConnections/hooks/useTestConnectionConfig';
import {
    getPostHogQueryPath,
    toPostHogCreatePayload,
    type PostHogConnectionValues,
    type PostHogRegion,
} from './postHogConnection';

type Props = {
    projectUuid: string;
    form: UseFormReturnType<PostHogConnectionValues>;
    isEditing: boolean;
};

export const PostHogConnectionStep: FC<Props> = ({
    projectUuid,
    form,
    isEditing,
}) => {
    const testMutation = useTestConnectionConfig();

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        const config = toPostHogCreatePayload(form.values);
        testMutation.mutate({
            projectUuid,
            config,
            method: 'POST',
            path: getPostHogQueryPath(form.values.projectId.trim()),
            body: { query: { kind: 'HogQLQuery', query: 'SELECT 1' } },
        });
    };

    return (
        <Stack gap="sm">
            <Text c="dimmed" fz="sm">
                AI agents send HogQL queries to this PostHog project and read
                the results live. Use a personal API key with the Query Read
                scope.
            </Text>
            <TextInput
                required
                label="Name"
                data-autofocus
                {...form.getInputProps('name')}
            />
            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    Region
                </Text>
                <SegmentedControl
                    fullWidth
                    data={[
                        { value: 'us', label: 'US Cloud' },
                        { value: 'eu', label: 'EU Cloud' },
                    ]}
                    value={form.values.region}
                    onChange={(value) =>
                        form.setFieldValue('region', value as PostHogRegion)
                    }
                />
            </Stack>
            <TextInput
                required
                label="Project ID"
                description="The number after /project/ in your PostHog URL"
                placeholder="12345"
                {...form.getInputProps('projectId')}
            />
            <PasswordInput
                required={!isEditing}
                label="Personal API key"
                description={
                    isEditing ? 'Leave blank to keep the current key' : null
                }
                placeholder="phx_..."
                {...form.getInputProps('apiKey')}
            />
            <Group>
                <Button
                    type="button"
                    variant="default"
                    onClick={handleTest}
                    loading={testMutation.isLoading}
                    disabled={isEditing && form.values.apiKey.trim() === ''}
                >
                    Test connection
                </Button>
            </Group>
            {testMutation.data && (
                <ConnectionTestResult response={testMutation.data} />
            )}
        </Stack>
    );
};
