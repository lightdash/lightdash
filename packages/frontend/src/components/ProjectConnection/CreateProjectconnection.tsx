import {
    isApiError,
    isCreateProjectJob,
    JobStatusType,
    JobStepStatusType,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Button, Group, Loader } from '@mantine-8/core';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useLocation } from 'react-router';
import {
    getInFlightJobUuidFromError,
    useActiveCreateProjectJob,
} from '../../hooks/useActiveCreateProjectJob';
import { useCreateMutation } from '../../hooks/useProject';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
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
import { useCreateProjectSuccessRedirect } from './useCreateProjectSuccessRedirect';
import { useOnProjectError } from './useOnProjectError';
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
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJob, setActiveJobId, setQuietActiveJobId } = useActiveJob();
    const { isLoading: isSaving, mutateAsync } = useCreateMutation({
        quietJobToast: warehouseOnly,
        warehouseOnly,
    });
    const onProjectError = useOnProjectError();

    const resumeJob = useCallback(
        (jobUuid: string) => {
            setCreateProjectJobId(jobUuid);
            if (warehouseOnly) {
                setQuietActiveJobId(jobUuid);
            } else {
                setActiveJobId(jobUuid);
            }
        },
        [warehouseOnly, setActiveJobId, setQuietActiveJobId],
    );

    const { data: inFlightJob, isInitialLoading: isCheckingInFlightJob } =
        useActiveCreateProjectJob();

    useEffect(() => {
        if (
            !inFlightJob ||
            createProjectJobId ||
            ![JobStatusType.STARTED, JobStatusType.RUNNING].includes(
                inFlightJob.jobStatus,
            )
        ) {
            return;
        }
        resumeJob(inFlightJob.jobUuid);
    }, [inFlightJob, createProjectJobId, resumeJob]);

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

    // The warehouse adapter test runs inside the async create job, so
    // connection failures surface as the job's ERROR status, not via the
    // create mutation's onError (which only covers sync API errors).
    const trackedFailedJobRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (
            createProjectJobId &&
            createProjectJobId === activeJob?.jobUuid &&
            isCreateProjectJob(activeJob) &&
            activeJob.jobStatus === JobStatusType.ERROR &&
            trackedFailedJobRef.current !== createProjectJobId
        ) {
            trackedFailedJobRef.current = createProjectJobId;
            const failedStep = activeJob.steps.find(
                (step) => step.stepStatus === JobStepStatusType.ERROR,
            );
            track({
                name: EventName.CREATE_PROJECT_FAILED,
                properties: {
                    warehouse: selectedWarehouse ?? form.values.warehouse.type,
                    errorType: failedStep?.stepType ?? 'unknown',
                    warehouseOnly,
                    onboardingFlow,
                },
            });
        }
    }, [
        activeJob,
        createProjectJobId,
        selectedWarehouse,
        warehouseOnly,
        onboardingFlow,
        track,
        form.values.warehouse.type,
    ]);

    const hasThisJobFailed =
        !!createProjectJobId &&
        createProjectJobId === activeJob?.jobUuid &&
        isCreateProjectJob(activeJob) &&
        activeJob.jobStatus === JobStatusType.ERROR;

    // Stay busy from submit right through the success redirect, so the button
    // never flips back to its label in the beat between the job finishing and
    // the navigation (and the confetti). It only becomes clickable again if the
    // job errors, so the user can fix the details and retry.
    const isSavingProject = useMemo<boolean>(
        () => isSaving || (!!createProjectJobId && !hasThisJobFailed),
        [isSaving, createProjectJobId, hasThisJobFailed],
    );

    const thisJob =
        createProjectJobId &&
        createProjectJobId === activeJob?.jobUuid &&
        isCreateProjectJob(activeJob)
            ? activeJob
            : undefined;

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
                                        !isCreatingFirstProject &&
                                        !warehouseOnly
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
