import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ServiceAccountScope,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconKey } from '@tabler/icons-react';
import { addDays } from 'date-fns';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useMemo, type FC } from 'react';
import { z } from 'zod';
import { useServiceAccounts } from '../../../ee/features/serviceAccounts/useServiceAccounts';
import useToaster from '../../../hooks/toaster/useToaster';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';

export type GeneratedToken = {
    token: string;
    description: string;
    expiresLabel: string;
};

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    projectName: string;
    onGenerated: (token: GeneratedToken) => void;
};

const EXPIRE_OPTIONS = [
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
    { label: '60 days', value: '60' },
    { label: '90 days', value: '90' },
    { label: '6 months', value: '180' },
    { label: '1 year', value: '365' },
    { label: 'No expiration', value: '' },
];

// Interactive Viewer is the minimum role that can run semantic-layer queries.
// Lower roles (Viewer) can't, so they're intentionally omitted here.
const ROLE_OPTIONS = [
    {
        value: ProjectMemberRole.INTERACTIVE_VIEWER,
        label: `${
            ProjectMemberRoleLabels[ProjectMemberRole.INTERACTIVE_VIEWER]
        } (recommended)`,
    },
    {
        value: ProjectMemberRole.EDITOR,
        label: ProjectMemberRoleLabels[ProjectMemberRole.EDITOR],
    },
    {
        value: ProjectMemberRole.DEVELOPER,
        label: ProjectMemberRoleLabels[ProjectMemberRole.DEVELOPER],
    },
    {
        value: ProjectMemberRole.ADMIN,
        label: ProjectMemberRoleLabels[ProjectMemberRole.ADMIN],
    },
];

export const GenerateTokenModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    projectName,
    onGenerated,
}) => {
    const { createAccount } = useServiceAccounts();
    const { showToastError } = useToaster();

    const validationSchema = z.object({
        description: z.string().min(1, { message: 'Description is required' }),
        expiresAt: z.string(),
        role: z.nativeEnum(ProjectMemberRole),
    });

    const form = useForm({
        initialValues: {
            description: 'Metric SQL API',
            expiresAt: '90',
            role: ProjectMemberRole.INTERACTIVE_VIEWER as ProjectMemberRole,
        },
        validate: zodResolver(validationSchema),
    });

    const expiresLabel = useMemo(
        () =>
            EXPIRE_OPTIONS.find((o) => o.value === form.values.expiresAt)
                ?.label ?? '',
        [form.values.expiresAt],
    );

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const handleSubmit = form.onSubmit(({ description, expiresAt, role }) => {
        const expiresAtValue = expiresAt
            ? addDays(new Date(), Number(expiresAt))
            : null;

        createAccount.mutate(
            {
                description,
                expiresAt: expiresAtValue,
                // Project-scoped SA: `system:member` + a single project grant.
                scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                projectAccess: [{ projectUuid, role }],
            },
            {
                onSuccess: async (account) => {
                    try {
                        await navigator.clipboard.writeText(account.token);
                    } catch {
                        showToastError({
                            title: "Couldn't copy token to clipboard",
                            subtitle:
                                'Copy it from the connection form before leaving the page.',
                        });
                    }
                    onGenerated({
                        token: account.token,
                        description,
                        expiresLabel: expiresAt
                            ? `expires in ${expiresLabel.toLowerCase()}`
                            : 'never expires',
                    });
                    form.reset();
                },
            },
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Create service account token"
            icon={IconKey}
            size="md"
            cancelLabel="Cancel"
            cancelDisabled={createAccount.isLoading}
            actions={
                <Button
                    type="submit"
                    form="generate-pgwire-token-form"
                    loading={createAccount.isLoading}
                >
                    Generate & copy
                </Button>
            }
        >
            <Text c="ldGray.6" fz="sm" mt={-4}>
                A project-level token, scoped to this project. Shown only once.
            </Text>
            <form id="generate-pgwire-token-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        label="Description"
                        placeholder="What's this token for?"
                        required
                        disabled={createAccount.isLoading}
                        {...form.getInputProps('description')}
                    />
                    <Select
                        label="Expires"
                        data={EXPIRE_OPTIONS}
                        allowDeselect={false}
                        disabled={createAccount.isLoading}
                        {...form.getInputProps('expiresAt')}
                    />
                    <Stack gap="xs">
                        <Text fz="sm" fw={500}>
                            Project · role
                        </Text>
                        <Group grow align="flex-start" wrap="nowrap">
                            <TextInput readOnly value={projectName} disabled />
                            <Select
                                data={ROLE_OPTIONS}
                                allowDeselect={false}
                                disabled={createAccount.isLoading}
                                {...form.getInputProps('role')}
                            />
                        </Group>
                    </Stack>
                    <Callout variant="info" hideIcon>
                        <Text fz="sm">
                            <Text span fw={600}>
                                Interactive Viewer
                            </Text>{' '}
                            is the minimum for the Metric SQL API — it can read
                            this project&apos;s explores and run queries against
                            them. Pick a higher role only if the same token is
                            reused elsewhere.
                        </Text>
                    </Callout>
                </Stack>
            </form>
        </MantineModal>
    );
};
