import { Button, Stack, TextInput, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconGitBranch } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('sourceCode');
    const { mutateAsync, isLoading } = useCreateGitBranch(projectUuid);

    const form = useForm<FormState>({
        initialValues: {
            name: '',
        },
        validateInputOnChange: true,
        validate: {
            name: (value) => {
                if (!value.trim()) return t('createBranch.nameRequired');
                if (!/^[\w\-./]+$/.test(value))
                    return t('createBranch.nameInvalid');
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
            title={t('createBranch.title')}
            icon={IconGitBranch}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="create-branch-form"
                >
                    {t('createBranch.submit')}
                </Button>
            }
        >
            <form id="create-branch-form" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label={t('createBranch.nameLabel')}
                        required
                        placeholder={t('createBranch.namePlaceholder')}
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <TextInput
                        label={t('createBranch.createFrom')}
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
