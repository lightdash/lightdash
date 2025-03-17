import {
    DbtProjectConfig,
    DbtProjectType,
    ProjectType,
    WarehouseTypes,
    isCreateProjectJob,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';

import { useCreateMutation } from '../../hooks/useProject';

import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { dbtDefaults } from './DbtForms/defaultValues';
import { dbtFormValidators } from './DbtForms/validators';
import { FormProvider, useForm } from './formContext';
import { FormContainer } from './ProjectConnection.styles';
import { ProjectForm } from './ProjectForm';
import { ProjectFormProvider } from './ProjectFormProvider';
import { type ProjectConnectionForm } from './types';
import { useOnProjectError } from './useOnProjectError';
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';
import { warehouseValueValidators } from './WarehouseForms/validators';
interface CreateProjectConnectionProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse?: WarehouseTypes | undefined;
}

const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
}) => {
    const navigate = useNavigate();
    const { user, health } = useApp();
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJobIsRunning, activeJobId, activeJob } = useActiveJob();
    const { isLoading: isSaving, mutateAsync } = useCreateMutation();
    const onProjectError = useOnProjectError();

    selectedWarehouse = selectedWarehouse ?? WarehouseTypes.BIGQUERY;
    const dbtType = health.data?.defaultProject?.type ?? dbtDefaults.dbtType;
    const form = useForm({
        initialValues: {
            name: user.data?.organizationName || '',
            dbt: {
                ...dbtDefaults.formValues[dbtType],
                ...health.data?.defaultProject,
            } as DbtProjectConfig,
            warehouse: {
                ...warehouseDefaultValues[selectedWarehouse],
            } as CreateWarehouseCredentials,
            dbtVersion: dbtDefaults.dbtVersion,
        },
        validate: {
            warehouse: warehouseValueValidators[selectedWarehouse],
            dbt: dbtFormValidators[dbtType],
        },
        validateInputOnBlur: true,
    });

    const { track } = useTracking();

    const handleSubmit = async (formValues: ProjectConnectionForm) => {
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

    const handleError = (errors: typeof form.errors) => {
        onProjectError(errors);
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
                <form onSubmit={form.onSubmit(handleSubmit, handleError)}>
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

export default CreateProjectConnection;
