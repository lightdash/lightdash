import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
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

const ChartDuplicateForm: FC<
    ChartDuplicateModalProps & {
        savedQuery: SavedChart | null;
        isInitialLoading: boolean;
    }
> = ({ uuid, savedQuery, isInitialLoading, onConfirm, opened, onClose }) => {
    const { mutateAsync: duplicateChart, isLoading: isUpdating } =
        useDuplicateChartMutation({
            showRedirectButton: true,
        });

    const form = useForm<FormState>({
        initialValues: {
            name: savedQuery ? `Copy of ${savedQuery.name}` : '',
            description: savedQuery?.description,
        },
    });

    const isLoading = isInitialLoading || !savedQuery || isUpdating;

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
            opened={opened}
            onClose={onClose}
            title="Duplicate Chart"
            icon={IconCopy}
            actions={
                <Button
                    disabled={!form.isValid() || !savedQuery}
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

const ChartDuplicateModal: FC<ChartDuplicateModalProps> = (props) => {
    const projectUuid = useProjectUuid();
    const { data: savedQuery, isInitialLoading } = useSavedQuery({
        uuidOrSlug: props.uuid,
        projectUuid,
    });

    return (
        <ChartDuplicateForm
            key={savedQuery?.uuid ?? 'loading'}
            savedQuery={savedQuery ?? null}
            isInitialLoading={isInitialLoading}
            {...props}
        />
    );
};

export default ChartDuplicateModal;
