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
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';

interface DashboardUpdateModalProps extends DialogProps {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const DashboardUpdateModal: FC<DashboardUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { data: dashboard, isLoading } = useDashboardQuery(uuid);
    const { mutateAsync, isLoading: isUpdating } = useUpdateDashboard(uuid);

    const form = useForm<FormState>({
        mode: 'onChange',
        defaultValues: {
            name: dashboard?.name,
            description: dashboard?.description,
        },
    });

    if (isLoading || !dashboard) {
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
        <Dialog lazy title="Update Dashboard" icon="control" {...modalProps}>
            <Form
                title="Update Dashboard"
                methods={form}
                onSubmit={handleConfirm}
            >
                <DialogBody>
                    <Input
                        label="Enter a memorable name for your dashboard"
                        name="name"
                        placeholder="eg. KPI Dashboards"
                        disabled={isUpdating}
                        rules={{ required: 'Name field is required' }}
                        defaultValue={dashboard?.name || ''}
                    />

                    <Input
                        label="Description"
                        name="description"
                        placeholder="A few words to give your team some context"
                        disabled={isUpdating}
                        defaultValue={dashboard?.description || ''}
                    />
                </DialogBody>

                <DialogFooter
                    actions={
                        <>
                            <Button onClick={modalProps.onClose}>Cancel</Button>

                            <Button
                                disabled={!form.formState.isValid}
                                loading={isUpdating}
                                intent="primary"
                                type="submit"
                            >
                                Save
                            </Button>
                        </>
                    }
                />
            </Form>
        </Dialog>
    );
};

export default DashboardUpdateModal;
