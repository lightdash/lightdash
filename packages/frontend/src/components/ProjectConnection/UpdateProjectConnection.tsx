import { subject } from '@casl/ability';
import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    ProjectType,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Alert, Anchor, Button, Card, Flex } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';

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
import { useOnProjectError } from './useOnProjectError';

export const UpdateProjectConnection: FC<{
    projectUuid: string;
}> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const ability = useAbilityContext();
    const { data } = useProject(projectUuid);
    const onError = useOnProjectError();
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

    const form = useForm({ name: 'updateProject' });

    useEffect(() => {
        if (data) {
            form.setInitialValues({
                name: data.name,
                dbt: data.dbtConnection,
                warehouse:
                    data.warehouseConnection as CreateWarehouseCredentials,
                dbtVersion: data.dbtVersion ?? DefaultSupportedDbtVersion,
            });
        }
    }, [data, form]);

    const { track } = useTracking();

    const onSubmit = async ({
        name,
        dbt: dbtConnection,
        warehouse: warehouseConnection,
        dbtVersion,
    }: ProjectConnectionForm) => {
        return console.log('onSubmit', {
            name,
            dbtConnection,
            warehouseConnection,
            dbtVersion,
        });

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

    if (data?.type === ProjectType.PREVIEW) {
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
                    <ProjectFormProvider savedProject={data}>
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
                            {data?.dbtConnection?.type === DbtProjectType.NONE
                                ? 'Save and test'
                                : 'Test & deploy project'}
                        </Button>
                    </Card>
                </form>
            </FormContainer>
        </FormProvider>
    );
};
