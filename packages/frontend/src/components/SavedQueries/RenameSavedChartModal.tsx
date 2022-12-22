import { Button, Classes, Dialog, Intent } from '@blueprintjs/core';
import { UpdateSavedChart } from '@lightdash/common';
import React, { FC, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSavedQuery, useUpdateMutation } from '../../hooks/useSavedQuery';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';

interface Props {
    savedChartUuid: string;
    isOpen: boolean;

    onClose?: () => void;
}

const RenameSavedChartModal: FC<Props> = ({
    savedChartUuid,
    isOpen,
    onClose,
}) => {
    const { data: savedChart, isLoading } = useSavedQuery({
        id: savedChartUuid,
    });
    const { mutate, isLoading: isSaving } = useUpdateMutation(savedChartUuid);
    const methods = useForm<UpdateSavedChart>({
        mode: 'onSubmit',
    });
    const { setValue } = methods;

    useEffect(() => {
        if (savedChart) {
            setValue('name', savedChart?.name);
            setValue('description', savedChart?.description);
        }
    }, [savedChart, setValue]);

    const handleSubmit = useCallback(
        (data: UpdateSavedChart) => {
            mutate(data);
            if (onClose) onClose();
        },
        [mutate, onClose],
    );

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            lazy
            title="Rename your chart"
            canOutsideClickClose={false}
        >
            <Form
                name="rename_saved_chart"
                methods={methods}
                onSubmit={handleSubmit}
            >
                <div className={Classes.DIALOG_BODY}>
                    <Input
                        label="Enter a memorable name for your chart"
                        name="name"
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isLoading}
                        rules={{
                            required: 'Required field',
                        }}
                    />
                    <Input
                        label="Chart description"
                        name="description"
                        placeholder="A few words to give your team some context"
                        disabled={isLoading}
                    />
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={onClose}>Cancel</Button>
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

export default RenameSavedChartModal;
