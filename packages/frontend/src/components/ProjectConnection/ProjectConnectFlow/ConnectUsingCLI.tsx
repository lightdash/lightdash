import { Button, Intent } from '@blueprintjs/core';
import { OrganizationProject } from '@lightdash/common';
import { FC, useRef } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useQueryClient } from 'react-query';
import { useHistory } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProjects } from '../../../hooks/useProjects';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import LinkButton from '../../common/LinkButton';
import InviteExpertFooter from './InviteExpertFooter';
import {
    Codeblock,
    CodeLabel,
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
    const existingProjects = useRef<OrganizationProject[]>();
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();
    const { track } = useTracking();

    useProjects({
        refetchInterval: 3000,
        refetchIntervalInBackground: true,
        retry: false,
        onSuccess: async (newProjects) => {
            if (!initialProjectFetch.current) {
                existingProjects.current = newProjects;
                initialProjectFetch.current = true;
            }

            if (
                existingProjects.current &&
                existingProjects.current.length < newProjects.length
            ) {
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
            if (error.statusCode === 404) {
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

                <LinkButton
                    minimal
                    intent={Intent.PRIMARY}
                    rightIcon="share"
                    href="https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready"
                    target="_blank"
                    trackingEvent={{
                        name: EventName.DOCUMENTATION_BUTTON_CLICKED,
                        properties: {
                            action: 'getting_started',
                        },
                    }}
                >
                    Read more about getting started.
                </LinkButton>

                <CodeLabel>In your Terminal, run:</CodeLabel>

                <Codeblock>
                    <pre>{codeBlock({ siteUrl, loginToken })}</pre>

                    <CopyToClipboard
                        text={codeBlock({ siteUrl, loginToken })}
                        options={{ message: 'Copied' }}
                        onCopy={() => {
                            showToastSuccess({
                                title: 'Commands copied to clipboard!',
                            });
                            track({
                                name: EventName.COPY_CREATE_PROJECT_CODE_BUTTON_CLICKED,
                            });
                        }}
                    >
                        <Button small minimal outlined icon="clipboard">
                            Copy
                        </Button>
                    </CopyToClipboard>
                </Codeblock>
                <StyledNonIdealState
                    title="Waiting for data"
                    icon="stopwatch"
                />
            </ConnectWarehouseWrapper>

            <LinkButton
                minimal
                intent={Intent.PRIMARY}
                href="/createProject/manual"
                trackingEvent={{
                    name: EventName.CREATE_PROJECT_MANUALLY_BUTTON_CLICKED,
                }}
            >
                Create project manually
            </LinkButton>

            <InviteExpertFooter />
        </Wrapper>
    );
};

export default ConnectUsingCLI;
