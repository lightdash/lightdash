import { subject } from '@casl/ability';
import {
    DbtProjectType,
    ProjectType,
    type CreateWarehouseCredentials,
    type Project,
} from '@lightdash/common';
import { Alert, Anchor, Button, Card, Flex } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';

import { useProject, useUpdateMutation } from '../../hooks/useProject';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { FormProvider, useForm } from './formContext';
import { FormContainer } from './ProjectConnection.styles';
import { ProjectForm } from './ProjectForm';
import { ProjectFormProvider } from './ProjectFormProvider';
import ProjectStatusCallout from './ProjectStatusCallout';
import { type ProjectConnectionForm } from './types';
import { WarehouseDefaultValues } from './WarehouseForms/defaultValues';

const UpdateProjectConnection: FC<{
    projectUuid: string;
    project: Project;
}> = ({ projectUuid, project }) => {
    const { user, health } = useApp();
    const ability = useAbilityContext();
    const {
        isLoading: isSaving,
        mutateAsync,
        isIdle,
        isSuccess,
        isError,
        error,
    } = useUpdateMutation(projectUuid);

    const isDisabled =
        isSaving ||
        ability.cannot(
            'update',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        );

    const form = useForm({
        initialValues: {
            name: project.name,
            dbt: project.dbtConnection,
            warehouse: {
                ...WarehouseDefaultValues[project.warehouseConnection!.type],
                ...project.warehouseConnection,
            } as CreateWarehouseCredentials,
            dbtVersion: project.dbtVersion,
        },
    });

    const { track } = useTracking();

    const onSubmit = async ({
        name,
        dbt: dbtConnection,
        warehouse: warehouseConnection,
        dbtVersion,
    }: ProjectConnectionForm) => {
        console.log('onSubmit', warehouseConnection);

        if (user.data) {
            track({
                name: EventName.UPDATE_PROJECT_BUTTON_CLICKED,
            });
            await mutateAsync({
                name,
                dbtConnection,
                warehouseConnection: warehouseConnection!,
                dbtVersion,
            });
        }
    };

    if (project.type === ProjectType.PREVIEW) {
        return (
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
                title="Developer previews are temporary Lightdash projects where settings cannot be changed."
            >
                Read docs{' '}
                <Anchor
                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-preview"
                    target="_blank"
                    rel="noreferrer"
                >
                    here
                </Anchor>{' '}
                to know more.
            </Alert>
        );
    }

    return (
        <FormProvider form={form}>
            <FormContainer>
                <form onSubmit={form.onSubmit(onSubmit)}>
                    <ProjectFormProvider savedProject={project}>
                        <ProjectForm
                            showGeneralSettings
                            isProjectUpdate
                            disabled={isDisabled}
                            defaultType={health.data?.defaultProject?.type}
                        />
                    </ProjectFormProvider>

                    {!isIdle && (
                        <ProjectStatusCallout
                            isSuccess={isSuccess}
                            isError={isError}
                            isLoading={isSaving}
                            error={error}
                        />
                    )}

                    <Card
                        component={Flex}
                        justify="flex-end"
                        pos="sticky"
                        withBorder
                        shadow="sm"
                        sx={(theme) => ({
                            zIndex: 1,
                            bottom: `-${theme.spacing.xl}`,
                        })}
                    >
                        <Button
                            type="submit"
                            loading={isSaving}
                            disabled={isDisabled}
                        >
                            {project.dbtConnection?.type === DbtProjectType.NONE
                                ? 'Save and test'
                                : 'Test & deploy project'}
                        </Button>
                    </Card>
                </form>
            </FormContainer>
        </FormProvider>
    );
};

const UpdateProjectConnectionWrapper: FC<{
    projectUuid: string;
}> = ({ projectUuid }) => {
    const { data } = useProject(projectUuid);

    if (!data) {
        return null;
    }

    return <UpdateProjectConnection projectUuid={projectUuid} project={data} />;
};

export default UpdateProjectConnectionWrapper;
