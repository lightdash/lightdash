import React from 'react';
import { useParams } from 'react-router-dom';
import SelectField from '../ReactHookForm/Select';
import Input from '../ReactHookForm/Input';
import { ActionModalProps } from '../common/modal/ActionModal';
import { useDashboards } from '../../hooks/dashboard/useDashboards';

type AddQueryToDashboardFormProps = Pick<
    ActionModalProps<{
        queryName: string;
    }>,
    'useActionModalState' | 'isDisabled'
>;

const AddQueryToDashboardForm = ({
    useActionModalState,
}: AddQueryToDashboardFormProps) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading: isLoadingDashboards, data = [] } =
        useDashboards(projectUuid);
    const [{ data: dataModal }] = useActionModalState;
    return (
        <div>
            <Input
                label="Query name"
                name="queryName"
                defaultValue={dataModal?.queryName}
            />
            <SelectField
                name="dashboardUuid"
                label="Select a dashboard"
                options={data.map(({ uuid, name }) => ({
                    value: uuid,
                    label: name,
                }))}
                disabled={isLoadingDashboards}
            />
            Add to a new dashboard
            <Input
                label="Dashboard name"
                name="dashboardName"
                defaultValue="Untitled Dashboard"
            />
        </div>
    );
};
AddQueryToDashboardForm.defaultProps = {
    savedQueryUuid: undefined,
};

export default AddQueryToDashboardForm;
