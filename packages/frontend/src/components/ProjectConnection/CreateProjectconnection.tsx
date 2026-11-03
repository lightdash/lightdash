import {
    isApiError,
    isCreateProjectJob,
    JobStatusType,
    JobStepStatusType,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Button, Group } from '@mantine/core';
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
import {
    getInFlightJobUuidFromError,
    useActiveCreateProjectJob,
} from '../../hooks/useActiveCreateProjectJob';
import { useCreateMutation } from '../../hooks/useProject';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { withViewTransition } from '../common/viewTransition';
import { ConnectionFormSkeleton } from './ConnectionFormSkeleton';
import classes from './CreateProjectconnection.module.css';
import CreateProjectJobProgress from './CreateProjectJobProgress';
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
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';
import { createWarehouseValueValidators } from './WarehouseForms/validators';

export type ConnectionFormStep = 'warehouse' | 'dbt';

interface CreateProjectConnectionProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse?: WarehouseTypes | undefined;
    warehouseOnly?: boolean;
    successRedirect?: (projectUuid: string) => string;
    /** Fire a confetti burst when the connection is saved successfully. */
    celebrateOnSuccess?: boolean;
    footerStart?: ReactNode;
    alwaysShowProjectName?: boolean;
    /** Splits the warehouse and dbt fields into two steps of the same form */
    steps?: {
        current: ConnectionFormStep;
        onChange: (step: ConnectionFormStep) => void;
    } | null;
}

const isDbtField = (path: string) => path.startsWith('dbt');

const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    warehouseOnly = false,
    successRedirect,
    celebrateOnSuccess = false,
    footerStart = null,
    alwaysShowProjectName = false,
    steps = null,
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
            warehouse: warehouseDefaultValues[warehouseType],
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

    const { track } = useTracking();

    const handleSubmit = async (formValues: ProjectConnectionForm) => {
        const {
            name,
            dbt: dbtConnection,
            warehouse: warehouseConnection,
            dbtVersion,
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

    const handleError = (errors: typeof form.errors) => {
        if (steps && Object.keys(errors).some((path) => !isDbtField(path))) {
            steps.onChange('warehouse');
        }
        onProjectError(errors);
    };

    const goToDbtStep = () => {
        if (!steps) return;
        const { errors } = form.validate();
        const warehouseErrors = Object.keys(errors).filter(
            (path) => !isDbtField(path),
        );
        if (warehouseErrors.length > 0) return;
        form.clearErrors();
        steps.onChange('dbt');
    };

    useCreateProjectSuccessRedirect({
        activeJob,
        createProjectJobId,
        successRedirect,
        celebrateOnSuccess,
        // Let the inline success state register before the next step slides in
        successHoldMs: warehouseOnly ? 900 : 0,
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
            !latestJobUuid ||
            (shown?.jobUuid === latestJobUuid &&
                shown.hidesForm === latestHidesForm)
        ) {
            return;
        }
        withViewTransition(() =>
            setShown({ jobUuid: latestJobUuid, hidesForm: latestHidesForm }),
        );
    }, [latestJobUuid, latestHidesForm, shown]);
    const thisJob =
        latestJob?.jobUuid === shown?.jobUuid ? latestJob : undefined;

    const hideForm = !!thisJob && !!shown?.hidesForm;

    if (isCheckingInFlightJob) {
        return <ConnectionFormSkeleton />;
    }

    const isWarehouseStep = steps?.current === 'warehouse';
    const submitButton = isWarehouseStep ? (
        <Button className={classes.submitButton} onClick={goToDbtStep}>
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
            {warehouseOnly ? 'Test & save' : 'Test & deploy project'}
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
                    <ProjectFormProvider>
                        {thisJob && (
                            <CreateProjectJobProgress
                                job={thisJob}
                                warehouseLabel={
                                    selectedWarehouse
                                        ? getWarehouseLabel(selectedWarehouse)
                                        : null
                                }
                            />
                        )}

                        {!hideForm && (
                            <>
                                <ProjectForm
                                    showGeneralSettings={showsProjectName}
                                    disabled={isSavingProject}
                                    defaultType={
                                        health.data?.defaultProject?.type
                                    }
                                    warehouseOnly={warehouseOnly}
                                    dbtTypePicker={steps ? 'tiles' : 'select'}
                                />

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
                                                    steps.onChange('warehouse')
                                                }
                                            >
                                                Back
                                            </Button>
                                        ) : (
                                            footerStart
                                        )}
                                        {submitButton}
                                    </Group>
                                ) : (
                                    submitButton
                                )}
                            </>
                        )}
                    </ProjectFormProvider>
                </FormContainer>
            </form>
        </FormProvider>
    );
};

export default CreateProjectConnection;
