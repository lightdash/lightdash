import {
    isApiError,
    JobStatusType,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Button, Group, Loader } from '@mantine/core';
import { useMemo, useRef, type FC } from 'react';
import { useLocation } from 'react-router';
import { getInFlightJobUuidFromError } from '../../hooks/useActiveCreateProjectJob';
import { useCreateMutation } from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import classes from './CreateProjectconnection.module.css';
import CreateProjectJobProgress from './CreateProjectJobProgress';
import { dbtDefaults, noneDefaultValues } from './DbtForms/defaultValues';
import { dbtFormValidators } from './DbtForms/validators';
import { FormContainer } from './FormContainer';
import { FormProvider, useForm } from './formContext';
import { ProjectForm } from './ProjectForm';
import { ProjectFormProvider } from './ProjectFormProvider';
import { type ProjectConnectionForm } from './types';
import { useCreateProjectJob } from './useCreateProjectJob';
import { useCreateProjectSuccessRedirect } from './useCreateProjectSuccessRedirect';
import { useOnProjectError } from './useOnProjectError';
import { useProjectSetupAttempt } from './useProjectSetupAttempt';
import { useTrackCreateProjectFailure } from './useTrackCreateProjectFailure';
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';
import { createWarehouseValueValidators } from './WarehouseForms/validators';

interface CreateProjectConnectionProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse?: WarehouseTypes | undefined;
    warehouseOnly?: boolean;
    successRedirect?: (projectUuid: string) => string;
    /** Fire a confetti burst when the connection is saved successfully. */
    celebrateOnSuccess?: boolean;
}

const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    warehouseOnly = false,
    successRedirect,
    celebrateOnSuccess = false,
}) => {
    const { pathname } = useLocation();
    const onboardingFlow = pathname.startsWith('/onboarding/')
        ? 'new'
        : 'legacy';
    const { user, health } = useApp();
    const { isConnectJourneyEnabled, setupAttemptPayload } =
        useProjectSetupAttempt();
    const { isLoading: isSaving, mutateAsync } = useCreateMutation({
        quietJobToast: warehouseOnly,
        warehouseOnly,
    });
    const onProjectError = useOnProjectError();

    const {
        activeJob,
        createProjectJobId,
        setCreateProjectJobId,
        resumeJob,
        isCheckingInFlightJob,
        thisJob,
        hasThisJobFailed,
    } = useCreateProjectJob(warehouseOnly);

    const submitButtonRef = useRef<HTMLButtonElement>(null);

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
            properties: {
                warehouse: selectedWarehouse ?? warehouseConnection.type,
                authenticationType:
                    'authenticationType' in warehouseConnection
                        ? warehouseConnection.authenticationType
                        : undefined,
                warehouseOnly,
                onboardingFlow,
            },
        });
        if (selectedWarehouse) {
            try {
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
                    ...setupAttemptPayload,
                });
                setCreateProjectJobId(data.jobUuid);
            } catch (error) {
                const inFlightJobUuid = isApiError(error)
                    ? getInFlightJobUuidFromError(error.error)
                    : undefined;
                if (inFlightJobUuid) {
                    resumeJob(inFlightJobUuid);
                }
            }
        }
    };

    const handleError = (errors: typeof form.errors) => {
        onProjectError(errors);
    };

    useCreateProjectSuccessRedirect({
        activeJob,
        createProjectJobId,
        successRedirect,
        celebrateOnSuccess,
        submitButtonRef,
    });

    useTrackCreateProjectFailure({
        activeJob,
        createProjectJobId,
        warehouse: selectedWarehouse ?? form.values.warehouse.type,
        warehouseOnly,
        onboardingFlow,
    });

    // Stay busy from submit right through the success redirect, so the button
    // never flips back to its label in the beat between the job finishing and
    // the navigation (and the confetti). It only becomes clickable again if the
    // job errors, so the user can fix the details and retry.
    const isSavingProject = useMemo<boolean>(
        () => isSaving || (!!createProjectJobId && !hasThisJobFailed),
        [isSaving, createProjectJobId, hasThisJobFailed],
    );

    const hideForm = !!thisJob && thisJob.jobStatus !== JobStatusType.ERROR;

    if (isCheckingInFlightJob) {
        return (
            <Group justify="center" p="xl">
                <Loader color="gray" />
            </Group>
        );
    }

    return (
        <FormProvider form={form}>
            <form
                className={classes.form}
                onSubmit={form.onSubmit(handleSubmit, handleError)}
            >
                <FormContainer>
                    <ProjectFormProvider>
                        {thisJob && <CreateProjectJobProgress job={thisJob} />}

                        {!hideForm && (
                            <>
                                <ProjectForm
                                    showGeneralSettings={
                                        isConnectJourneyEnabled ||
                                        (!isCreatingFirstProject &&
                                            !warehouseOnly)
                                    }
                                    disabled={isSavingProject}
                                    defaultType={
                                        health.data?.defaultProject?.type
                                    }
                                    warehouseOnly={warehouseOnly}
                                />

                                <Button
                                    ref={submitButtonRef}
                                    style={{ alignSelf: 'end' }}
                                    type="submit"
                                    loading={isSavingProject}
                                    disabled={!form.isValid()}
                                >
                                    {warehouseOnly
                                        ? 'Test & save'
                                        : 'Test & deploy project'}
                                </Button>
                            </>
                        )}
                    </ProjectFormProvider>
                </FormContainer>
            </form>
        </FormProvider>
    );
};

export default CreateProjectConnection;
