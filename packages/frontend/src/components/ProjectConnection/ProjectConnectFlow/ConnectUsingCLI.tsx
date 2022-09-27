import { Intent } from '@blueprintjs/core';
import { FC, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useProjects } from '../../../hooks/useProjects';
import LinkButton from '../../common/LinkButton';
import {
    Codeblock,
    ConnectWarehouseWrapper,
    StyledNonIdealState,
    Subtitle,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';

// TODO: where to put? lightdash help login

const codeBlock = String.raw`
#1 install lightdash CLI
npm install -g @lightdash/cli

#2 login to lightdash
lightdash login ${window.location.origin}

#3 create project command
lightdash deploy --create
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
                <Title>You're in! 🎉</Title>

                <Subtitle>
                    To get started, upload your dbt project to Lightdash using
                    our CLI tool.
                </Subtitle>

                <Codeblock>
                    <pre>{codeBlock}</pre>
                </Codeblock>

                <LinkButton
                    minimal
                    intent={Intent.PRIMARY}
                    rightIcon="share"
                    href="https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready"
                    target="_blank"
                >
                    Read more about getting started.
                </LinkButton>

                <StyledNonIdealState
                    title="Waiting for data"
                    icon="stopwatch"
                />
            </ConnectWarehouseWrapper>

            <LinkButton
                minimal
                intent={Intent.PRIMARY}
                href="/createProject/manual"
            >
                Create project manually
            </LinkButton>
        </Wrapper>
    );
};

export default ConnectUsingCLI;
