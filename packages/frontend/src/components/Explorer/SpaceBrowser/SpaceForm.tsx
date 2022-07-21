import { Classes } from '@blueprintjs/core';
import { UpdatedByUser } from '@lightdash/common';
import React from 'react';
import {
    ActionModalProps,
    ActionTypeModal,
} from '../../common/modal/ActionModal';
import Input from '../../ReactHookForm/Input';

export type SpaceBasicDetails = {
    uuid: string;
    name: string;
    updatedAt: Date;
    updatedByUser?: UpdatedByUser;
};
export const SpaceForm = ({
    useActionModalState,
    isDisabled,
}: Pick<
    ActionModalProps<SpaceBasicDetails>,
    'useActionModalState' | 'isDisabled'
>) => {
    const [{ actionType, data }] = useActionModalState;
    /* const { data: savedChart } = useSavedQuery({
        id: data?.uuid,
    });*/

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
                        defaultValue={''}
                    />
                </div>
            )}
            {actionType === ActionTypeModal.DELETE && (
                <p>Are you sure you want to delete this spaces ?</p>
            )}
        </>
    );
};
