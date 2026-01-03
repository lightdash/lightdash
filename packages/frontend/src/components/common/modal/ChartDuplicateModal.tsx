import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Stack,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import {
    useDuplicateChartMutation,
    useSavedQuery,
} from '../../../hooks/useSavedQuery';
import MantineModal from '../MantineModal';

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

    useEffect(() => {
        if (!savedQuery) return;

        const initialValues = {
            name: `Copy of ${savedQuery.name}`,
            description: savedQuery.description,
        };

        if (!form.initialized) {
            form.initialize(initialValues);
        } else {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedQuery]);

    const isLoading =
        isInitialLoading || !savedQuery || !form.initialized || isUpdating;

    const handleConfirm = form.onSubmit(async (data) => {
        const updatedChart = await duplicateChart({
            uuid: uuid,
            name: data.name,
            description: data.description,
        });

        onConfirm?.(updatedChart);
    });

    return (
        <MantineModal
            opened={modalProps.opened}
            onClose={modalProps.onClose}
            title="Duplicate Chart"
            icon={IconCopy}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="duplicate-chart-form"
                >
                    Create duplicate
                </Button>
            }
        >
            <form
                id="duplicate-chart-form"
                title="Duplicate Chart"
                onSubmit={handleConfirm}
            >
                <Stack>
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
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ChartDuplicateModal;
