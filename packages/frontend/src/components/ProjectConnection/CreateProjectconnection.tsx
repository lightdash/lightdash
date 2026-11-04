import {
    DbtProjectType,
    isApiError,
    isCreateProjectJob,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type JobStep,
} from '@lightdash/common';
import { Box, Button, Group, Loader } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { withViewTransition } from '../../features/apps/utils/viewTransition';
import {
    getInFlightJobUuidFromError,
    useActiveCreateProjectJob,
} from '../../hooks/useActiveCreateProjectJob';
import { useCreateMutation } from '../../hooks/useProject';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useApp from '../../providers/App/useApp';
import { type CreateProjectErrorCategory } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { ConnectionFormSkeleton } from './ConnectionFormSkeleton';
import classes from './CreateProjectconnection.module.css';
import CreateProjectJobProgress, {
    OnboardingConnectionProgress,
} from './CreateProjectJobProgress';
import { dbtDefaults, noneDefaultValues } from './DbtForms/defaultValues';
import { dbtFormValidators } from './DbtForms/validators';
import { FormContainer } from './FormContainer';
import { FormProvider, useForm } from './formContext';
import { getWarehouseLabel } from './ProjectConnectFlow/utils';
import { ProjectForm } from './ProjectForm';
import { ProjectFormProvider } from './ProjectFormProvider';
import { type ProjectConnectionForm } from './types';
import { useCreateProjectSuccessRedirect } from './useCreateProjectSuccessRedirect';
import { useOnProjectError } from './useOnProjectError';
import {
    onboardingWarehouseDefaultValues,
    warehouseDefaultValues,
} from './WarehouseForms/defaultValues';
import { isDbtStepField } from './WarehouseForms/util';
import { createWarehouseValueValidators } from './WarehouseForms/validators';

export type ConnectionFormStep = 'warehouse' | 'models' | 'dbt';

interface CreateProjectConnectionProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse?: WarehouseTypes | undefined;
    warehouseOnly?: boolean;
    successRedirect?: (projectUuid: string) => string;
    /** Fire a confetti burst when the connection is saved successfully. */
    celebrateOnSuccess?: boolean;
    footerStart?: ReactNode;
    alwaysShowProjectName?: boolean;
    /** Splits the warehouse, models choice and dbt fields into steps of the same form */
    steps?: {
        current: ConnectionFormStep;
        onChange: (step: ConnectionFormStep) => void;
    } | null;
    /** Content of the step between the warehouse and dbt fields */
    modelsStep?: ReactNode;
    submitLabel?: string;
}

const getJobErrorCategory = (
    step: JobStep | undefined,
): CreateProjectErrorCategory => {
    const error = step?.stepError ?? '';
    if (/password|authentication failed|incorrect username/i.test(error))
        return 'authentication';
    if (/permission denied|access denied|insufficient privileges/i.test(error))
        return 'permission';
    if (/timed? ?out/i.test(error)) return 'timeout';
    if (/enotfound|getaddrinfo|econnrefused|could not connect/i.test(error))
        return 'network';
    if (/does not exist|not found|unknown database/i.test(error))
        return 'not_found';
    if (step?.stepType === JobStepType.COMPILING) return 'dbt';
    return 'unknown';
};

const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    warehouseOnly = false,
    successRedirect,
    celebrateOnSuccess = false,
    footerStart = null,
    alwaysShowProjectName = false,
    steps = null,
    modelsStep = null,
    submitLabel,
}) => {
    const { pathname } = useLocation();
    const onboardingFlow = pathname.startsWith('/onboarding/')
        ? 'new'
        : 'legacy';
    const isNewOnboarding = onboardingFlow === 'new';
    const { user, health } = useApp();
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJob, setActiveJobId, setQuietActiveJobId } = useActiveJob();
    // Onboarding shows job progress inline instead of the global toast and drawer
    const quietJob = warehouseOnly || isNewOnboarding;
    const { isLoading: isSaving, mutateAsync } = useCreateMutation({
        quietJobToast: quietJob,
    });
    // Skipping dbt submits without a repo even when the form offered one
    const submittedWarehouseOnly = useRef(warehouseOnly);
    const onProjectError = useOnProjectError();

    const resumeJob = useCallback(
        (jobUuid: string) => {
            setCreateProjectJobId(jobUuid);
            if (quietJob) {
                setQuietActiveJobId(jobUuid);
            } else {
                setActiveJobId(jobUuid);
            }
        },
        [quietJob, setActiveJobId, setQuietActiveJobId],
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
    // The first project is named after the organization; every later one
    // needs its own name, otherwise its slug becomes "<org>-2", "<org>-3".
    const asksForProjectName = !isCreatingFirstProject;
    const showsProjectName = asksForProjectName || alwaysShowProjectName;
    const form = useForm({
        initialValues: {
            name: asksForProjectName ? '' : user.data?.organizationName || '',
            dbt: warehouseOnly
                ? noneDefaultValues
                : {
                      ...dbtDefaults.formValues[dbtType],
                      ...health.data?.defaultProject,
                  },
            warehouse: (isNewOnboarding
                ? onboardingWarehouseDefaultValues
                : warehouseDefaultValues)[warehouseType],
            dbtVersion: dbtDefaults.dbtVersion,
        },
        validate: {
            name: (value) =>
                showsProjectName && value.trim() === ''
                    ? 'Project name is required'
                    : null,
            warehouse: createWarehouseValueValidators[warehouseType],
            dbt: warehouseOnly ? {} : dbtFormValidators,
        },
        validateInputOnBlur: true,
    });

    // warehouseOnly can flip while the form is open, so swap the dbt values with it
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        form.setFieldValue(
            'dbt',
            warehouseOnly
                ? noneDefaultValues
                : {
                      ...dbtDefaults.formValues[dbtType],
                      ...health.data?.defaultProject,
                  },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warehouseOnly]);

    const { track } = useTracking();

    const handleSubmit = async (formValues: ProjectConnectionForm) => {
        const {
            name,
            dbt: dbtConnection,
            warehouse: warehouseConnection,
            dbtVersion,
        } = formValues;
        submittedWarehouseOnly.current =
            dbtConnection.type === DbtProjectType.NONE;
        track({
            name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
            properties: {
                warehouse: selectedWarehouse ?? warehouseConnection.type,
                authenticationType:
                    'authenticationType' in warehouseConnection
                        ? warehouseConnection.authenticationType
                        : undefined,
                warehouseOnly: submittedWarehouseOnly.current,
                onboardingFlow,
            },
        });
        if (selectedWarehouse) {
            try {
                const data = await mutateAsync({
                    name:
                        name.trim() ||
                        user.data?.organizationName ||
                        'My project',
                    type: ProjectType.DEFAULT,
                    dbtConnection,
                    dbtVersion,
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

    // Creates the project from the warehouse alone; the repo can be connected later from home
    const skipDbt = () => {
        const { errors } = form.validate();
        if (Object.keys(errors).some((path) => !path.startsWith('dbt'))) {
            handleError(errors);
            return;
        }
        form.clearErrors();
        void handleSubmit({ ...form.values, dbt: noneDefaultValues });
    };

    const handleError = (errors: typeof form.errors) => {
        if (
            steps &&
            Object.keys(errors).some(
                (path) => warehouseOnly || !isDbtStepField(path, warehouseType),
            )
        ) {
            steps.onChange('warehouse');
        }
        onProjectError(errors);
    };

    const goToNextStep = () => {
        if (!steps) return;
        const { errors } = form.validate();
        const warehouseErrors = Object.keys(errors).filter(
            (path) => warehouseOnly || !isDbtStepField(path, warehouseType),
        );
        if (warehouseErrors.length > 0) return;
        form.clearErrors();
        steps.onChange(
            steps.current === 'warehouse' && modelsStep ? 'models' : 'dbt',
        );
    };
    const previousStep: ConnectionFormStep =
        steps?.current === 'dbt' && modelsStep ? 'models' : 'warehouse';

    useCreateProjectSuccessRedirect({
        activeJob,
        createProjectJobId,
        successRedirect,
        celebrateOnSuccess,
        // Let the inline success state register before the next step slides in
        successHoldMs: isNewOnboarding ? 900 : 0,
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
                    failedStep: failedStep?.stepType ?? null,
                    errorCategory: getJobErrorCategory(failedStep),
                    warehouseOnly: submittedWarehouseOnly.current,
                    onboardingFlow,
                },
            });
        }
    }, [
        activeJob,
        createProjectJobId,
        selectedWarehouse,
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

    const latestJob =
        createProjectJobId &&
        createProjectJobId === activeJob?.jobUuid &&
        isCreateProjectJob(activeJob)
            ? activeJob
            : undefined;

    // Swap form and progress card inside a view transition so the card morphs instead of snapping
    const [shown, setShown] = useState<{
        jobUuid: string;
        hidesForm: boolean;
    } | null>(null);
    const latestJobUuid = latestJob?.jobUuid;
    const latestHidesForm =
        !!latestJob && latestJob.jobStatus !== JobStatusType.ERROR;
    useEffect(() => {
        if (
            !isNewOnboarding ||
            !latestJobUuid ||
            (shown?.jobUuid === latestJobUuid &&
                shown.hidesForm === latestHidesForm)
        ) {
            return;
        }
        const next = { jobUuid: latestJobUuid, hidesForm: latestHidesForm };
        // Onboarding keeps the form in place, so there is no layout swap to animate
        if (steps) setShown(next);
        else withViewTransition(() => setShown(next));
    }, [isNewOnboarding, latestJobUuid, latestHidesForm, shown, steps]);
    const thisJob =
        !isNewOnboarding || latestJob?.jobUuid === shown?.jobUuid
            ? latestJob
            : undefined;

    const lockForm =
        !!thisJob && (isNewOnboarding ? !!shown?.hidesForm : latestHidesForm);
    const hideForm = lockForm && !steps;

    if (isCheckingInFlightJob) {
        return isNewOnboarding ? (
            <ConnectionFormSkeleton />
        ) : (
            <Group justify="center" p="xl">
                <Loader color="gray" />
            </Group>
        );
    }

    const isWarehouseStep = steps?.current === 'warehouse';
    const isModelsStep = steps?.current === 'models';
    const showsNext = isWarehouseStep || (isModelsStep && !warehouseOnly);
    const submitButton = showsNext ? (
        <Button className={classes.submitButton} onClick={goToNextStep}>
            Next
        </Button>
    ) : (
        <Button
            ref={submitButtonRef}
            className={classes.submitButton}
            type="submit"
            loading={isSavingProject}
            disabled={!form.isValid()}
        >
            {submitLabel ??
                (warehouseOnly ? 'Test & save' : 'Test & deploy project')}
        </Button>
    );

    return (
        <FormProvider form={form}>
            <form
                className={classes.form}
                data-form-step={steps?.current}
                onSubmit={form.onSubmit(handleSubmit, handleError)}
            >
                <FormContainer>
                    <ProjectFormProvider revealAfterSignIn={!!steps}>
                        {thisJob &&
                            (isNewOnboarding ? (
                                <OnboardingConnectionProgress
                                    job={thisJob}
                                    warehouseLabel={
                                        selectedWarehouse
                                            ? getWarehouseLabel(
                                                  selectedWarehouse,
                                              )
                                            : null
                                    }
                                />
                            ) : (
                                <CreateProjectJobProgress job={thisJob} />
                            ))}

                        {!hideForm && (
                            <Box
                                className={classes.formBody}
                                data-locked={lockForm}
                                inert={lockForm}
                            >
                                <ProjectForm
                                    showGeneralSettings={showsProjectName}
                                    disabled={isSavingProject}
                                    defaultType={
                                        health.data?.defaultProject?.type
                                    }
                                    warehouseOnly={warehouseOnly}
                                    dbtTypePicker={steps ? 'tiles' : 'select'}
                                />

                                {isModelsStep && modelsStep}

                                {footerStart ? (
                                    <Group
                                        justify="space-between"
                                        data-form-footer
                                    >
                                        {steps && !isWarehouseStep ? (
                                            <Button
                                                variant="transparent"
                                                color="gray"
                                                px={0}
                                                onClick={() =>
                                                    steps.onChange(previousStep)
                                                }
                                            >
                                                Back
                                            </Button>
                                        ) : (
                                            footerStart
                                        )}
                                        {steps?.current === 'dbt' ? (
                                            <Group gap="xs">
                                                <Button
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={skipDbt}
                                                    disabled={isSavingProject}
                                                >
                                                    Skip for now
                                                </Button>
                                                {submitButton}
                                            </Group>
                                        ) : (
                                            submitButton
                                        )}
                                    </Group>
                                ) : (
                                    submitButton
                                )}
                            </Box>
                        )}
                    </ProjectFormProvider>
                </FormContainer>
            </form>
        </FormProvider>
    );
};

export default CreateProjectConnection;
