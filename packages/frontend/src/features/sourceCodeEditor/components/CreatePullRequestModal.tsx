import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('sourceCode');
    const { mutateAsync, isLoading } = useCreatePullRequest(projectUuid);

    const form = useForm<FormState>({
        initialValues: {
            title: t('createPullRequest.defaultTitle', { branch }),
            description: t('createPullRequest.defaultDescription'),
        },
        validateInputOnChange: true,
        validate: {
            title: (value) => {
                if (!value.trim()) return t('createPullRequest.titleRequired');
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
            title={t('createPullRequest.title')}
            icon={IconGitPullRequest}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="create-pr-form"
                >
                    {t('createPullRequest.title')}
                </Button>
            }
        >
            <form id="create-pr-form" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label={t('createPullRequest.titleLabel')}
                        required
                        placeholder={t('createPullRequest.titlePlaceholder')}
                        disabled={isLoading}
                        {...form.getInputProps('title')}
                    />
                    <TextInput
                        label={t('createPullRequest.fromBranch')}
                        value={branch}
                        disabled
                        readOnly
                    />
                    <Textarea
                        label={t('createPullRequest.descriptionLabel')}
                        placeholder={t(
                            'createPullRequest.descriptionPlaceholder',
                        )}
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
