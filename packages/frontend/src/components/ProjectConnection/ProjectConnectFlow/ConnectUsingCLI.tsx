import { Spinner } from '@blueprintjs/core';
import { FC, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useProjects } from '../../../hooks/useProjects';
import SimpleButton from '../../common/SimpleButton';
import InviteExpertFooter from './InviteExpertFooter';
import {
    Codeblock,
    ConnectWarehouseWrapper,
    StyledNonIdealState,
    Subtitle,
    Wrapper,
} from './ProjectConnectFlow.styles';

// TODO: where to put? lightdash help login

const codeBlock = String.raw`
# 1. install lightdash CLI
$ npm install -g @lightdash/cli

# 2. login to lightdash
$ lightdash login ${window.location.origin}

# 3. create project command
$ lightdash deploy --create
`.trim();

const ConnectUsingCLI: FC = () => {
    const history = useHistory();
    const [hasProject, setHasProject] = useState(false);

    useOrganisation({
        refetchInterval: hasProject ? 0 : 1000,
        refetchIntervalInBackground: true,
        onSuccess: (data) => {
            if (!data.needsProject) setHasProject(true);
        },
    });

    useProjects({
        enabled: hasProject,
        onSuccess: (projects) => {
            history.replace(
                `/createProject?projectUuid=${projects[0].projectUuid}`,
            );
        },
    });

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Subtitle>
                    To get started, upload your dbt project to Lightdash using
                    our CLI tool.
                </Subtitle>

                <Codeblock>
                    <pre>{codeBlock}</pre>
                </Codeblock>

                <SimpleButton
                    href="https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready"
                    target="_blank"
                >
                    read more about getting started.
                </SimpleButton>

                <StyledNonIdealState
                    title="Waiting for data"
                    icon={<Spinner />}
                />
            </ConnectWarehouseWrapper>

            <SimpleButton href="/createProject?method=manual">
                Create project manually
            </SimpleButton>

            <InviteExpertFooter />
        </Wrapper>
    );
};

export default ConnectUsingCLI;
