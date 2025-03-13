import { subject } from '@casl/ability';
import { DbtProjectType, ProjectType } from '@lightdash/common';
import { Alert, Anchor, Button, Card, Flex } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useForm } from 'react-hook-form';

import { useProject, useUpdateMutation } from '../../hooks/useProject';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
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
    const updateMutation = useUpdateMutation(projectUuid);
    const { isLoading: isSaving, mutateAsync, isIdle } = updateMutation;

    const isDisabled =
        isSaving ||
        ability.cannot(
            'update',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        );

    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            name: data?.name,
            dbt: data?.dbtConnection,
            warehouse: {
                ...data?.warehouseConnection,
            },
            dbtVersion: data?.dbtVersion,
        },
    });
    const { reset } = methods;
    useEffect(() => {
        if (data) {
            reset({
                name: data.name,
                dbt: data.dbtConnection,
                warehouse: data.warehouseConnection,
                dbtVersion: data.dbtVersion,
            });
        }
    }, [reset, data]);
    const { track } = useTracking();

    const onSubmit = async ({
        name,
        dbt: dbtConnection,
        warehouse: warehouseConnection,
        dbtVersion,
    }: Required<ProjectConnectionForm>) => {
        if (user.data) {
            track({
                name: EventName.UPDATE_PROJECT_BUTTON_CLICKED,
            });
            await mutateAsync({
                name,
                dbtConnection,
                warehouseConnection,
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
        <FormContainer
            name="update_project"
            methods={methods}
            onSubmit={onSubmit}
            onError={onError}
        >
            <ProjectFormProvider savedProject={data}>
                <ProjectForm
                    showGeneralSettings
                    isProjectUpdate
                    disabled={isDisabled}
                    defaultType={health.data?.defaultProject?.type}
                />
            </ProjectFormProvider>

            {!isIdle && <ProjectStatusCallout mutation={updateMutation} />}

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
                <Button type="submit" loading={isSaving} disabled={isDisabled}>
                    {data?.dbtConnection?.type === DbtProjectType.NONE
                        ? 'Save and test'
                        : 'Test & deploy project'}
                </Button>
            </Card>
        </FormContainer>
    );
};
