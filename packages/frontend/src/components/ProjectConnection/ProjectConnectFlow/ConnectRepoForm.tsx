import {
    DbtProjectType,
    JobStatusType,
    JobStepStatusType,
    type CreateWarehouseCredentials,
    type Project,
} from '@lightdash/common';
import { Alert, Button, Group, Stack } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import { useUpdateMutation } from '../../../hooks/useProject';
import useActiveJob from '../../../providers/ActiveJob/useActiveJob';
import { dbtDefaults } from '../DbtForms/defaultValues';
import { dbtFormValidators } from '../DbtForms/validators';
import DbtSettingsForm from '../DbtSettingsForm';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import { type ProjectConnectionForm } from '../types';
import { useOnProjectError } from '../useOnProjectError';
import { warehouseDefaultValues } from '../WarehouseForms/defaultValues';

// Adds a repo to a project saved warehouse-only; the saved warehouse credentials are kept as they are
export const ConnectRepoForm: FC<{
    project: Project;
    onConnected: () => void;
}> = ({ project, onConnected }) => {
    const { mutateAsync, isLoading } = useUpdateMutation(project.projectUuid);
    const { activeJob } = useActiveJob();
    const onProjectError = useOnProjectError();
    const [jobUuid, setJobUuid] = useState<string | null>(null);
    const job = jobUuid && activeJob?.jobUuid === jobUuid ? activeJob : null;
    const failedStep =
        job?.jobStatus === JobStatusType.ERROR
            ? job.steps.find(
                  (step) => step.stepStatus === JobStepStatusType.ERROR,
              )
            : undefined;

    const warehouseType = project.warehouseConnection?.type;
    const form = useForm({
        initialValues: {
            name: project.name,
            dbt: dbtDefaults.formValues[DbtProjectType.GITHUB],
            warehouse: {
                ...(warehouseType ? warehouseDefaultValues[warehouseType] : {}),
                ...project.warehouseConnection,
            } as CreateWarehouseCredentials,
            dbtVersion: project.dbtVersion,
        },
        validate: { dbt: dbtFormValidators },
        validateInputOnBlur: true,
    });

    useEffect(() => {
        if (job?.jobStatus === JobStatusType.DONE) onConnected();
    }, [job?.jobStatus, onConnected]);

    const handleSubmit = async ({
        name,
        dbt,
        warehouse,
        dbtVersion,
    }: ProjectConnectionForm) => {
        const { jobUuid: startedJobUuid } = await mutateAsync({
            name,
            dbtConnection: dbt,
            warehouseConnection: warehouse,
            dbtVersion,
        });
        setJobUuid(startedJobUuid);
    };

    const isConnecting =
        isLoading || (!!jobUuid && job?.jobStatus !== JobStatusType.ERROR);

    return (
        <FormProvider form={form}>
            <form onSubmit={form.onSubmit(handleSubmit, onProjectError)}>
                <Stack gap="lg">
                    <ProjectFormProvider revealAfterSignIn>
                        <DbtSettingsForm
                            disabled={isConnecting}
                            typePicker="tiles"
                        />
                    </ProjectFormProvider>
                    {failedStep && (
                        <Alert color="red" title="Couldn't connect your repo">
                            {failedStep.stepError ??
                                'Check the repo settings and try again.'}
                        </Alert>
                    )}
                    <Group justify="flex-end" data-form-footer>
                        <Button type="submit" loading={isConnecting}>
                            Connect repo
                        </Button>
                    </Group>
                </Stack>
            </form>
        </FormProvider>
    );
};
