import React from 'react';
import { useParams } from 'react-router-dom';
import { NonIdealState, Spinner } from '@blueprintjs/core';
import { UseFormReturn } from 'react-hook-form';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import SavedQueryForm from '../components/SavedQueries/SavedQueryForm';
import ActionCardList from '../components/common/ActionCardList';
import {
    useUpdateDashboard,
    useDeleteMutation,
} from '../hooks/dashboard/useDashboard';

const SavedDashboards = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data: dashboards = [] } = useDashboards(projectUuid);
    const useDelete = useDeleteMutation();

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading charts" icon={<Spinner />} />
            </div>
        );
    }

    return (
        <ActionCardList
            useUpdate={useUpdateDashboard}
            useDelete={useDelete}
            dataList={dashboards}
            setFormValues={(data: any, methods: UseFormReturn<any, object>) => {
                const { setValue } = methods;
                if (data?.name) {
                    setValue('name', data?.name);
                }
            }}
            getURL={(savedDashboard: any | undefined) => {
                const { uuid } = savedDashboard;
                return `/projects/${projectUuid}/dashboards/${uuid}`;
            }}
            ModalForm={SavedQueryForm}
        />
    );
};

export default SavedDashboards;
