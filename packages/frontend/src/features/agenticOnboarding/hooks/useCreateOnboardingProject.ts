import {
    DbtProjectType,
    ProjectType,
    type ApiCreateProjectResults,
    type ApiError,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { dbtDefaults } from '../../../components/ProjectConnection/DbtForms/defaultValues';

type CreateOnboardingProjectParams = {
    name: string;
    warehouseConnection: CreateWarehouseCredentials;
};

// Uses the non-compiling create: onboarding runs its own diagnostics, and the
// CLI SSO path intentionally starts from placeholder credentials
const createOnboardingProject = async ({
    name,
    warehouseConnection,
}: CreateOnboardingProjectParams): Promise<{ projectUuid: string }> => {
    const results = await lightdashApi<ApiCreateProjectResults>({
        url: `/org/projects`,
        method: 'POST',
        body: JSON.stringify({
            name,
            type: ProjectType.DEFAULT,
            dbtConnection: dbtDefaults.formValues[DbtProjectType.NONE],
            dbtVersion: dbtDefaults.dbtVersion,
            warehouseConnection,
        }),
    });
    return { projectUuid: results.project.projectUuid };
};

export const useCreateOnboardingProject = () =>
    useMutation<
        { projectUuid: string },
        ApiError,
        CreateOnboardingProjectParams
    >({
        mutationKey: ['onboarding', 'create-project'],
        mutationFn: createOnboardingProject,
    });
