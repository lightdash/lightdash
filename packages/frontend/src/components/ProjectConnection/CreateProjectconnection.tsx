import {
    isCreateProjectJob,
    JobStatusType,
    JobStepStatusType,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getProject, useCreateMutation } from '../../hooks/useProject';
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
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const onboardingFlow = pathname.startsWith('/onboarding/')
        ? 'new'
        : 'legacy';
    const queryClient = useQueryClient();
    const { user, health } = useApp();
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJob } = useActiveJob();
    const { isLoading: isSaving, mutateAsync } = useCreateMutation({
        quietJobToast: warehouseOnly,
        warehouseOnly,
    });
    const onProjectError = useOnProjectError();

    const submitButtonRef = useRef<HTMLButtonElement>(null);
    const hasFiredConfettiRef = useRef(false);

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
            !createProjectJobId ||
            createProjectJobId !== activeJob?.jobUuid ||
            !isCreateProjectJob(activeJob) ||
            !activeJob.jobResults?.projectUuid
        ) {
            return;
        }
        const { projectUuid } = activeJob.jobResults;
        const redirectTo = successRedirect
            ? successRedirect(projectUuid)
            : `/createProjectSettings/${projectUuid}`;

        if (!celebrateOnSuccess) {
            void navigate({ pathname: redirectTo });
            return;
        }

        // Celebrate path fires exactly once — the effect re-runs on every
        // job-status poll, and the async closure below owns the navigation.
        if (hasFiredConfettiRef.current) {
            return;
        }
        hasFiredConfettiRef.current = true;

        const rect = submitButtonRef.current?.getBoundingClientRect();
        const origin = rect
            ? {
                  x: (rect.left + rect.width / 2) / window.innerWidth,
                  y: (rect.top + rect.height / 2) / window.innerHeight,
              }
            : { x: 0.5, y: 0.7 };
        // The canvas outlives the client-side navigation, so the burst carries
        // over onto the page we land on.
        void confetti({
            disableForReducedMotion: true,
            startVelocity: 35,
            particleCount: 120,
            spread: 100,
            gravity: 0.7,
            origin,
        });

        // Warm the caches the home reads before we land there, so it doesn't
        // flash the stale "connect your warehouse" checklist (the projects/org
        // lists still show no warehouse) or a cold project spinner. The button
        // stays busy meanwhile, so it reads as one smooth step. Navigate even
        // if priming fails.
        void (async () => {
            try {
                await Promise.all([
                    queryClient.refetchQueries({
                        queryKey: ['projects'],
                        type: 'all',
                    }),
                    queryClient.refetchQueries({
                        queryKey: ['organization'],
                        type: 'all',
                    }),
                    queryClient.prefetchQuery({
                        queryKey: ['project', projectUuid],
                        queryFn: () => getProject(projectUuid),
                    }),
                ]);
            } catch {
                // Ignore — the destination will load normally on its own.
            }
            void navigate({ pathname: redirectTo });
        })();
    }, [
        activeJob,
        celebrateOnSuccess,
        createProjectJobId,
        navigate,
        queryClient,
        successRedirect,
    ]);

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
                    </ProjectFormProvider>
                </FormContainer>
            </form>
        </FormProvider>
    );
};

export default CreateProjectConnection;
