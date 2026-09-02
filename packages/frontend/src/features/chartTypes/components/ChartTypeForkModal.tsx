import { Button, Stack, TextInput, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconGitFork } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import MantineModal from '../../../components/common/MantineModal';
import useToaster from '../../../hooks/toaster/useToaster';
import { useDuplicateApp } from '../../apps/hooks/useDuplicateApp';
import { chartTypeBuilderPath } from '../utils/chartTypeBuilderPath';

type Props = {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    projectUuid: string;
    appUuid: string;
    defaultName: string;
};

const forkSchema = z.object({
    name: z.string().trim().min(1, { message: 'Name is required' }),
});

type FormState = z.infer<typeof forkSchema>;

/** Forks an official (registry-installed) chart type into an editable copy. */
const ChartTypeForkModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    appUuid,
    defaultName,
}) => {
    const navigate = useNavigate();
    const { showToastSuccess } = useToaster();
    const { mutate: duplicate, isLoading: isForking } = useDuplicateApp();

    const form = useForm<FormState>({
        initialValues: { name: defaultName },
        validate: zodResolver(forkSchema),
        validateInputOnChange: true,
    });

    const handleSubmit = form.onSubmit((data) => {
        duplicate(
            { projectUuid, appUuid, name: data.name.trim() },
            {
                onSuccess: (result) => {
                    showToastSuccess({ title: 'Chart type forked' });
                    void navigate(
                        chartTypeBuilderPath(projectUuid, result.appUuid),
                    );
                },
            },
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Fork to customize"
            icon={IconGitFork}
            description="Forking creates your own copy on its own version path. It won't receive registry updates."
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isForking}
                    type="submit"
                    form="fork-chart-type"
                >
                    Fork
                </Button>
            }
        >
            <form id="fork-chart-type" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Name"
                        required
                        placeholder="eg. Radial gauge (custom)"
                        disabled={isForking}
                        {...form.getInputProps('name')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ChartTypeForkModal;
