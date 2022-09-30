import { Button, Intent } from '@blueprintjs/core';
import { OrganizationProject } from '@lightdash/common';
import { FC, useRef } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useQueryClient } from 'react-query';
import { useHistory } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
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

interface ConnectUsingCliProps {
    siteUrl: string;
    loginToken?: string;
    needsProject: boolean;
}

const codeBlock = ({
    siteUrl,
    loginToken,
}: Pick<ConnectUsingCliProps, 'siteUrl' | 'loginToken'>) =>
    String.raw`
#1 install lightdash CLI
npm install -g @lightdash/cli

#2 login to lightdash
lightdash login ${siteUrl} --token ${loginToken}

#3 create project
lightdash deploy --create
`.trim();

const ConnectUsingCLI: FC<ConnectUsingCliProps> = ({
    needsProject,
    siteUrl,
    loginToken,
}) => {
    const history = useHistory();
    const initialProjectFetch = useRef(false);
    const existingProjects = useRef<OrganizationProject[]>([]);
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();

    useProjects({
        refetchInterval: 3000,
        refetchIntervalInBackground: true,
        onSuccess: async (newProjects) => {
            if (!initialProjectFetch.current) {
                existingProjects.current = newProjects;
                initialProjectFetch.current = true;
            }

            if (existingProjects.current.length < newProjects.length) {
                const uuids = newProjects.map((p) => p.projectUuid);
                const existingUuids = existingProjects.current.map(
                    (p) => p.projectUuid,
                );

                const newProjectUuid = uuids.find(
                    (uuid) => !existingUuids.includes(uuid),
                );

                await queryClient.invalidateQueries('organisation');

                history.replace(
                    `/createProject/cli?projectUuid=${newProjectUuid}`,
                );
            }
        },
        onError: ({ error }) => {
            if (error.statusCode === 400) {
                existingProjects.current = [];
                initialProjectFetch.current = true;
            }
        },
    });

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                {needsProject ? (
                    <Title>You're in! 🎉</Title>
                ) : (
                    <Title>Connect new project</Title>
                )}

                <Subtitle>
                    To get started, upload your dbt project to Lightdash using
                    our CLI tool.
                </Subtitle>

                <Codeblock>
                    <pre>{codeBlock({ siteUrl, loginToken })}</pre>

                    <CopyToClipboard
                        text={codeBlock({ siteUrl, loginToken })}
                        options={{ message: 'Copied' }}
                        onCopy={() =>
                            showToastSuccess({
                                title: 'Commands copied to clipboard!',
                            })
                        }
                    >
                        <Button small minimal outlined icon="clipboard">
                            Copy
                        </Button>
                    </CopyToClipboard>
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
