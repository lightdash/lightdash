import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Textarea,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, type FC } from 'react';
import {
    useDuplicateChartMutation,
    useSavedQuery,
} from '../../../hooks/useSavedQuery';

interface ChartDuplicateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: (savedChart: SavedChart) => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartDuplicateModal: FC<ChartDuplicateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { mutateAsync: duplicateChart, isLoading: isUpdating } =
        useDuplicateChartMutation({
            showRedirectButton: true,
        });
    const { data: savedQuery, isInitialLoading } = useSavedQuery({ id: uuid });

    const form = useForm<FormState>();
    const { setInitialValues, setValues, initialized, initialize } = form;

    useEffect(() => {
        if (!savedQuery) return;

        const initialValues = {
            name: `Copy of ${savedQuery.name}`,
            description: savedQuery.description,
        };

        if (!initialized) {
            initialize(initialValues);
        } else {
            setInitialValues(initialValues);
            setValues(initialValues);
        }
    }, [savedQuery, initialized, setInitialValues, setValues, initialize]);

    const isLoading =
        isInitialLoading || !savedQuery || !initialized || isUpdating;

    const handleConfirm = form.onSubmit(async (data) => {
        const updatedChart = await duplicateChart({
            uuid: uuid,
            name: data.name,
            description: data.description,
        });

        onConfirm?.(updatedChart);
    });

    return (
        <Modal title={<Title order={4}>Duplicate Chart</Title>} {...modalProps}>
            <form title="Duplicate Chart" onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label="Chart name"
                        required
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                        value={form.values.name ?? ''}
                    />

                    <Textarea
                        label="Chart description"
                        placeholder="A few words to give your team some context"
                        disabled={isLoading}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                        value={form.values.description ?? ''}
                    />

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={modalProps.onClose}>
                            Cancel
                        </Button>

                        <Button
                            disabled={!form.isValid()}
                            loading={isLoading}
                            type="submit"
                        >
                            Create duplicate
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartDuplicateModal;
