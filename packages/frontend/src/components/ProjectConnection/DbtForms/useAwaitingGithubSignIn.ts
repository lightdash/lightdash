import { DbtProjectType } from '@lightdash/common';
import { useGithubConfig } from '../../common/GithubIntegration/hooks/useGithubIntegration';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

/** True while an onboarding GitHub OAuth connection has nothing to configure yet */
export const useAwaitingGithubSignIn = () => {
    const { revealAfterSignIn } = useProjectFormContext();
    const form = useFormContext();
    const { data: githubConfig } = useGithubConfig();
    const { dbt } = form.values;
    return (
        !!revealAfterSignIn &&
        dbt.type === DbtProjectType.GITHUB &&
        (dbt.authorization_method ?? 'installation_id') === 'installation_id' &&
        githubConfig?.installationId === undefined
    );
};
