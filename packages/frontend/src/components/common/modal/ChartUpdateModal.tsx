import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useSavedQuery, useUpdateMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import MantineModal from '../MantineModal';

interface ChartUpdateModalProps extends Pick<ModalProps, 'opened' | 'onClose'> {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

type ChartUpdateFormProps = ChartUpdateModalProps & {
    chart: SavedChart;
};

const ChartUpdateForm: FC<ChartUpdateFormProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
    chart,
}) => {
    const dashboardUuid = useSearchParams('fromDashboard');
    const { mutateAsync, isLoading: isUpdating } = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        uuid,
    );

    const form = useForm<FormState>({
        initialValues: {
            name: chart.name,
            description: chart.description,
        },
    });

    const handleConfirm = form.onSubmit(async (data) => {
        await mutateAsync({
            name: data.name,
            description: data.description,
        });
        onConfirm?.();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Update Chart"
            icon={IconPencil}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isUpdating}
                    type="submit"
                    form="update-chart-form"
                >
                    Save
                </Button>
            }
        >
            <form
                id="update-chart-form"
                title="Update Chart"
                onSubmit={handleConfirm}
            >
                <Stack>
                    <TextInput
                        label="Chart name"
                        required
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label="Chart description"
                        placeholder="A few words to give your team some context"
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

const ChartUpdateModal: FC<ChartUpdateModalProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
}) => {
    const projectUuid = useProjectUuid();
    const { data: chart, isInitialLoading } = useSavedQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });

    if (isInitialLoading || !chart) {
        return null;
    }

    return (
        <ChartUpdateForm
            key={chart.uuid}
            chart={chart}
            opened={opened}
            onClose={onClose}
            uuid={uuid}
            onConfirm={onConfirm}
        />
    );
};

export default ChartUpdateModal;
