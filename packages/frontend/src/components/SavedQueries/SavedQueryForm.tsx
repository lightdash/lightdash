import { Classes } from '@blueprintjs/core';
import { SpaceQuery } from 'common';
import React from 'react';
import { ActionModalProps, ActionTypeModal } from '../common/modal/ActionModal';
import Input from '../ReactHookForm/Input';

const SavedQueryForm = ({
    useActionModalState,
    isDisabled,
}: Pick<
    ActionModalProps<SpaceQuery>,
    'useActionModalState' | 'isDisabled'
>) => {
    const [{ actionType, data }] = useActionModalState;
    return (
        <>
            {actionType === ActionTypeModal.UPDATE && (
                <div className={Classes.DIALOG_BODY}>
                    <Input
                        label="Enter a memorable name for your chart"
                        name="name"
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isDisabled}
                        rules={{
                            required: 'Required field',
                        }}
                        defaultValue={data?.name}
                    />
                    <Input
                        label="Chart description"
                        name="description"
                        placeholder="A few words to give your team some context"
                        disabled={isDisabled}
                        defaultValue={data?.description && data?.description}
                    />
                </div>
            )}
            {actionType === ActionTypeModal.DELETE && (
                <p>Are you sure you want to delete this chart ?</p>
            )}
        </>
    );
};

export default SavedQueryForm;
