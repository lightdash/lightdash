import { Button, Classes, Dialog, Intent } from '@blueprintjs/core';
import { UpdateDashboardDetails } from '@lightdash/common';
import { FC, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    useDashboardQuery,
    useUpdateDashboardName,
} from '../../hooks/dashboard/useDashboard';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';

interface Props {
    dashboardUuid: string;
    isOpen: boolean;
    onClose?: (value?: UpdateDashboardDetails) => void;
}

const UpdateDashboardModal: FC<Props> = ({
    dashboardUuid,
    isOpen,
    onClose,
}) => {
    const { data: dashboard, isLoading } = useDashboardQuery(dashboardUuid);
    const { mutate, isLoading: isSaving } =
        useUpdateDashboardName(dashboardUuid);
    const methods = useForm<UpdateDashboardDetails>({
        mode: 'onSubmit',
    });
    const { setValue } = methods;

    useEffect(() => {
        if (dashboard) {
            setValue('name', dashboard?.name);
            setValue('description', dashboard?.description);
        }
    }, [dashboard, setValue]);

    const handleSubmit = useCallback(
        (data: UpdateDashboardDetails) => {
            mutate(data);
            onClose?.(data);
        },
        [mutate, onClose],
    );

    return (
        <Dialog
            isOpen={isOpen}
            onClose={() => onClose?.()}
            lazy
            title="Rename your dashboard"
        >
            <Form
                name="rename_dashboard"
                methods={methods}
                onSubmit={handleSubmit}
            >
                <div className={Classes.DIALOG_BODY}>
                    <Input
                        label="Enter a memorable name for your dashboard"
                        name="name"
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isLoading}
                        rules={{
                            required: 'Required field',
                        }}
                    />
                    <Input
                        label="Dashboard description"
                        name="description"
                        placeholder="A few words to give your team some context"
                        disabled={isLoading}
                    />
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={() => onClose?.()}>Cancel</Button>
                        <Button
                            intent={Intent.SUCCESS}
                            text="Save"
                            type="submit"
                            disabled={isLoading || isSaving}
                        />
                    </div>
                </div>
            </Form>
        </Dialog>
    );
};

export default UpdateDashboardModal;
