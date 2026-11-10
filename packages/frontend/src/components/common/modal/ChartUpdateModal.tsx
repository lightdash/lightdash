import { type SavedChart } from '@lightdash/common';
import { Button, Stack, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import {
    RegenerableDescriptionInput,
    RegenerableNameInput,
    useRegenerateChartMetadata,
} from '../../../ee/features/ambientAi';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useSavedQuery, useUpdateMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import MantineModal from '../MantineModal';

interface ChartUpdateModalProps extends Pick<ModalProps, 'opened' | 'onClose'> {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartUpdateModal: FC<ChartUpdateModalProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
}) => {
    const projectUuid = useProjectUuid();
    const dashboardUuid = useSearchParams('fromDashboard');
    const { data: chart, isInitialLoading } = useSavedQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });
    const { mutateAsync, isLoading: isUpdating } = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        uuid,
    );

    const form = useForm<FormState>({
        initialValues: {
            name: '',
            description: '',
        },
    });

    const { setValues, setFieldValue } = form;

    // The saved chart's naming style is unknown, so the first click rewrites
    // the name for the chart as it is now, in its current voice
    const { getRegenerateProps } = useRegenerateChartMetadata({
        projectUuid,
        chart,
        referenceTitle: chart?.name,
        onGenerated: setFieldValue,
        enabled: opened,
        disabled: isUpdating,
    });

    // The modal stays mounted while closed, so start from the saved values on
    // every open: Cancel then discards edits and regenerated text alike
    useEffect(() => {
        if (!chart || !opened) return;
        setValues({
            name: chart.name,
            description: chart.description,
        });
    }, [chart, opened, setValues]);

    if (isInitialLoading || !chart) {
        return null;
    }

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
                    <RegenerableNameInput
                        label="Chart name"
                        required
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                        regenerate={getRegenerateProps('name')}
                    />

                    <RegenerableDescriptionInput
                        label="Chart description"
                        placeholder="A few words to give your team some context"
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                        regenerate={getRegenerateProps('description')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ChartUpdateModal;
