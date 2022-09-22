import { DashboardBasicDetails } from '@lightdash/common';
import { FC } from 'react';
import { ActionModalProps, ActionTypeModal } from '../common/modal/ActionModal';
import Input from '../ReactHookForm/Input';

type DashboardFormProps = Pick<
    ActionModalProps<DashboardBasicDetails>,
    'useActionModalState' | 'isDisabled'
>;

const DashboardForm: FC<DashboardFormProps> = ({
    useActionModalState,
    isDisabled,
}) => {
    const [{ actionType, data }] = useActionModalState;

    return (
        <>
            {actionType === ActionTypeModal.UPDATE && (
                <>
                    <Input
                        label="Enter a memorable name for your dashboard"
                        name="name"
                        placeholder="eg. KPI Dashboards"
                        disabled={isDisabled}
                        rules={{ required: 'Name field is required' }}
                        showError={false}
                        defaultValue={data?.name || ''}
                    />

                    <Input
                        label="Description"
                        name="description"
                        placeholder="A few words to give your team some context"
                        disabled={isDisabled}
                        showError={false}
                        defaultValue={data?.description || ''}
                    />
                </>
            )}

            {actionType === ActionTypeModal.DELETE && (
                <p>Are you sure you want to delete this dashboard ?</p>
            )}
        </>
    );
};

export default DashboardForm;
