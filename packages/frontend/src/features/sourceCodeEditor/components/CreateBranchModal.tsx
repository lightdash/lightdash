import { Button, Stack, TextInput, type ModalProps } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconGitBranch } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateGitBranch } from '../hooks';

type CreateBranchModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    sourceBranch: string;
    onBranchCreated: (branchName: string) => void;
};

type FormState = {
    name: string;
};

const CreateBranchModal: FC<CreateBranchModalProps> = ({
    opened,
    onClose,
    projectUuid,
    sourceBranch,
    onBranchCreated,
}) => {
    const { mutateAsync, isLoading } = useCreateGitBranch(projectUuid);

    const form = useForm<FormState>({
        initialValues: {
            name: '',
        },
        validateInputOnChange: true,
        validate: {
            name: (value) => {
                if (!value.trim()) return 'Branch name is required';
                if (!/^[\w\-./]+$/.test(value))
                    return 'Branch name can only contain letters, numbers, dashes, underscores, dots, and slashes';
                return null;
            },
        },
    });

    const handleSubmit = form.onSubmit(async (data) => {
        const branch = await mutateAsync({
            name: data.name,
            sourceBranch,
        });
        form.reset();
        onBranchCreated(branch.name);
        onClose();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Create new branch"
            icon={IconGitBranch}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="create-branch-form"
                >
                    Create branch
                </Button>
            }
        >
            <form id="create-branch-form" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Branch name"
                        required
                        placeholder="e.g., feature/my-changes"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <TextInput
                        label="Create from"
                        value={sourceBranch}
                        disabled
                        readOnly
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default CreateBranchModal;
