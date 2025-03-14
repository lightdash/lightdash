import {
    ProjectType,
    isCreateProjectJob,
    type WarehouseTypes,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';

import { useCreateMutation } from '../../hooks/useProject';

import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { FormProvider, useForm } from './formContext';
import { FormContainer } from './ProjectConnection.styles';
import { ProjectForm } from './ProjectForm';
import { ProjectFormProvider } from './ProjectFormProvider';
import { type ProjectConnectionForm } from './types';
import { useOnProjectError } from './useOnProjectError';
import { WarehouseDefaultValues } from './WarehouseForms/defaults';

interface CreateProjectConnectionProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse?: WarehouseTypes | undefined;
}

export const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
}) => {
    const navigate = useNavigate();
    const { user, health } = useApp();
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJobIsRunning, activeJobId, activeJob } = useActiveJob();
    const onError = useOnProjectError();
    const { isLoading: isSaving, mutateAsync } = useCreateMutation();

    const form = useForm({
        initialValues: {
            name: user.data?.organizationName || '',
            // @ts-expect-error
            dbt: health.data?.defaultProject || {},
            warehouse: {
                // @ts-expect-error todo: fix this
                ...WarehouseDefaultValues[selectedWarehouse!],
            },
        },
    });

    const { track } = useTracking();

    const onSubmit = async (formValues: ProjectConnectionForm) => {
        const {
            name,
            dbt: dbtConnection,
            warehouse: warehouseConnection,
            dbtVersion,
        } = formValues;
        console.log(formValues.warehouse);
        track({
            name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
        });
        if (selectedWarehouse) {
            const data = await mutateAsync({
                name: name || user.data?.organizationName || 'My project',
                type: ProjectType.DEFAULT,
                dbtConnection,
                dbtVersion,
                //@ts-ignore
                warehouseConnection: {
                    ...warehouseConnection,
                    type: selectedWarehouse,
                },
            });
            setCreateProjectJobId(data.jobUuid);
        }
    };

    useEffect(() => {
        if (
            createProjectJobId &&
            createProjectJobId === activeJob?.jobUuid &&
            isCreateProjectJob(activeJob) &&
            activeJob.jobResults?.projectUuid
        ) {
            void navigate({
                pathname: `/createProjectSettings/${activeJob?.jobResults?.projectUuid}`,
            });
        }
    }, [activeJob, createProjectJobId, navigate]);

    const isSavingProject = useMemo<boolean>(
        () =>
            isSaving ||
            (!!activeJobIsRunning && activeJobId === createProjectJobId),
        [activeJobId, activeJobIsRunning, createProjectJobId, isSaving],
    );

    return (
        <FormProvider form={form}>
            <FormContainer>
                <form onSubmit={form.onSubmit(onSubmit)}>
                    <ProjectFormProvider>
                        <ProjectForm
                            showGeneralSettings={!isCreatingFirstProject}
                            disabled={isSavingProject}
                            defaultType={health.data?.defaultProject?.type}
                            selectedWarehouse={selectedWarehouse}
                        />

                        <Button
                            sx={{ alignSelf: 'end' }}
                            type="submit"
                            loading={isSavingProject}
                        >
                            Test & deploy project
                        </Button>
                    </ProjectFormProvider>
                </form>
            </FormContainer>
        </FormProvider>
    );
};
