import {
    isCreateProjectJob,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useCreateMutation } from '../../hooks/useProject';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import classes from './CreateProjectconnection.module.css';
import { dbtDefaults, noneDefaultValues } from './DbtForms/defaultValues';
import { dbtFormValidators } from './DbtForms/validators';
import { FormContainer } from './FormContainer';
import { FormProvider, useForm } from './formContext';
import { ProjectForm } from './ProjectForm';
import { ProjectFormProvider } from './ProjectFormProvider';
import { type ProjectConnectionForm } from './types';
import { useOnProjectError } from './useOnProjectError';
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';
import { createWarehouseValueValidators } from './WarehouseForms/validators';

interface CreateProjectConnectionProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse?: WarehouseTypes | undefined;
    warehouseOnly?: boolean;
    successRedirect?: (projectUuid: string) => string;
}

const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    warehouseOnly = false,
    successRedirect,
}) => {
    const navigate = useNavigate();
    const { user, health } = useApp();
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJobIsRunning, activeJobId, activeJob } = useActiveJob();
    const { isLoading: isSaving, mutateAsync } = useCreateMutation({
        quietJobToast: warehouseOnly,
    });
    const onProjectError = useOnProjectError();

    const warehouseType = selectedWarehouse ?? WarehouseTypes.BIGQUERY;
    const dbtType = health.data?.defaultProject?.type ?? dbtDefaults.dbtType;
    const form = useForm({
        initialValues: {
            name: user.data?.organizationName || '',
            dbt: warehouseOnly
                ? noneDefaultValues
                : {
                      ...dbtDefaults.formValues[dbtType],
                      ...health.data?.defaultProject,
                  },
            warehouse: warehouseDefaultValues[warehouseType],
            dbtVersion: dbtDefaults.dbtVersion,
            organizationWarehouseCredentialsUuid: undefined,
        },
        validate: {
            warehouse: createWarehouseValueValidators[warehouseType],
            dbt: warehouseOnly ? {} : dbtFormValidators,
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
            organizationWarehouseCredentialsUuid,
        } = formValues;
        track({
            name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
        });
        if (selectedWarehouse) {
            const data = await mutateAsync({
                name: name || user.data?.organizationName || 'My project',
                type: ProjectType.DEFAULT,
                dbtConnection,
                dbtVersion,
                organizationWarehouseCredentialsUuid,
                warehouseConnection: {
                    ...warehouseConnection,
                    type: selectedWarehouse,
                } as CreateWarehouseCredentials,
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
            const { projectUuid } = activeJob.jobResults;
            void navigate({
                pathname: successRedirect
                    ? successRedirect(projectUuid)
                    : `/createProjectSettings/${projectUuid}`,
            });
        }
    }, [activeJob, createProjectJobId, navigate, successRedirect]);

    const isSavingProject = useMemo<boolean>(
        () =>
            isSaving ||
            (!!activeJobIsRunning && activeJobId === createProjectJobId),
        [activeJobId, activeJobIsRunning, createProjectJobId, isSaving],
    );

    return (
        <FormProvider form={form}>
            <form
                className={classes.form}
                onSubmit={form.onSubmit(handleSubmit, handleError)}
            >
                <FormContainer>
                    <ProjectFormProvider>
                        <ProjectForm
                            showGeneralSettings={
                                !isCreatingFirstProject && !warehouseOnly
                            }
                            disabled={isSavingProject}
                            defaultType={health.data?.defaultProject?.type}
                            warehouseOnly={warehouseOnly}
                        />

                        <Button
                            style={{ alignSelf: 'end' }}
                            type="submit"
                            loading={isSavingProject}
                            disabled={!form.isValid()}
                        >
                            {warehouseOnly
                                ? 'Test & save'
                                : 'Test & deploy project'}
                        </Button>
                    </ProjectFormProvider>
                </FormContainer>
            </form>
        </FormProvider>
    );
};

export default CreateProjectConnection;
