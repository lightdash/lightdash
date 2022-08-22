import { DbtProjectType } from '@lightdash/common';
import { FC } from 'react';
import {
    hasNoWhiteSpaces,
    isGitRepository,
    startWithSlash,
} from '../../../utils/fieldValidators';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const GitlabForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITLAB;
    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                label="Personal access token"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token-2"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="dbt.repository"
                label="Repository"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#repository-1"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                        isGitRepository: isGitRepository('Repository'),
                    },
                }}
                disabled={disabled}
                placeholder="org/project"
            />
            <Input
                name="dbt.branch"
                label="Branch"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#branch-1"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Branch'),
                    },
                }}
                disabled={disabled}
                defaultValue="main"
            />
            <Input
                name="dbt.project_sub_path"
                label="Project directory path"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project-directory-path-1"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Project directory path',
                        ),
                        startWithSlash: startWithSlash(
                            'Project directory path',
                        ),
                    },
                }}
                disabled={disabled}
                defaultValue="/"
            />
            <Input
                name="dbt.host_domain"
                label="Host domain (for self-hosted instances)"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#host-domain-1"
                disabled={disabled}
                defaultValue="gitlab.com"
                rules={{
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Host domain'),
                    },
                }}
            />
        </>
    );
};

export default GitlabForm;
