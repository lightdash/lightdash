import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
} from '@blueprintjs/core';
import { SavedChart } from '@lightdash/common';
import { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import {
    useDeleteMutation,
    useSavedQuery,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';

interface ChartUpdateModalProps extends DialogProps {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartUpdateModal: FC<ChartUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { data: chart, isLoading } = useSavedQuery({ id: uuid });
    const { mutateAsync, isLoading: isUpdating } = useUpdateMutation(
        chart?.uuid,
    );

    const form = useForm<FormState>({
        mode: 'onChange',
        defaultValues: {
            name: chart?.name,
            description: chart?.description,
        },
    });

    if (isLoading || !chart) {
        return null;
    }

    const handleConfirm = async (data: FormState) => {
        await mutateAsync({
            name: data.name,
            description: data.description,
        });
        onConfirm?.();
    };

    return (
        <Dialog {...modalProps} title="Update Chart" icon="chart">
            <Form title="Update Chart" methods={form} onSubmit={handleConfirm}>
                <DialogBody>
                    <Input
                        label="Enter a memorable name for your chart"
                        name="name"
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isUpdating}
                        rules={{ required: 'Name field is required' }}
                        defaultValue={chart.name || ''}
                    />

                    <Input
                        label="Chart descriptionsss"
                        name="description"
                        placeholder="A few words to give your team some context"
                        disabled={isUpdating}
                        defaultValue={chart.description || ''}
                    />
                </DialogBody>

                <DialogFooter
                    actions={
                        <Button
                            loading={isUpdating}
                            intent="primary"
                            type="submit"
                        >
                            Save
                        </Button>
                    }
                />
            </Form>
        </Dialog>
    );
};

export default ChartUpdateModal;
