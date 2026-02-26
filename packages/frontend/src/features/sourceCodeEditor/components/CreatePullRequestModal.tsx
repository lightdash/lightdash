import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreatePullRequest } from '../hooks';

type CreatePullRequestModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    branch: string;
    onPRCreated: (prUrl: string) => void;
};

type FormState = {
    title: string;
    description: string;
};

const CreatePullRequestModal: FC<CreatePullRequestModalProps> = ({
    opened,
    onClose,
    projectUuid,
    branch,
    onPRCreated,
}) => {
    const { mutateAsync, isLoading } = useCreatePullRequest(projectUuid);

    const form = useForm<FormState>({
        initialValues: {
            title: `Update from branch ${branch}`,
            description:
                'This pull request contains changes made via the Lightdash source code editor.',
        },
        validateInputOnChange: true,
        validate: {
            title: (value) => {
                if (!value.trim()) return 'Title is required';
                return null;
            },
        },
    });

    const handleSubmit = form.onSubmit(async (data) => {
        const result = await mutateAsync({
            branch,
            title: data.title,
            description: data.description,
        });
        form.reset();
        onPRCreated(result.prUrl);
        onClose();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Create Pull Request"
            icon={IconGitPullRequest}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="create-pr-form"
                >
                    Create Pull Request
                </Button>
            }
        >
            <form id="create-pr-form" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Title"
                        required
                        placeholder="e.g., Add new metric to orders model"
                        disabled={isLoading}
                        {...form.getInputProps('title')}
                    />
                    <TextInput
                        label="From branch"
                        value={branch}
                        disabled
                        readOnly
                    />
                    <Textarea
                        label="Description"
                        placeholder="Describe your changes..."
                        disabled={isLoading}
                        autosize
                        minRows={4}
                        maxRows={8}
                        {...form.getInputProps('description')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default CreatePullRequestModal;
