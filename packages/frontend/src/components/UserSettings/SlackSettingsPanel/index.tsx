import { AnchorButton, Button, Icon, Spinner } from '@blueprintjs/core';
import { FC } from 'react';
import { useDeleteSlack, useGetSlack } from '../../../hooks/useSlack';
import { useApp } from '../../../providers/AppProvider';
import slackSvg from './slack.svg';
import {
    Actions,
    AppearancePanelWrapper,
    Description,
    SlackIcon,
    SlackName,
    SlackSettingsWrapper,
    Title,
} from './SlackSettingsPanel.styles';

const SlackSettingsPanel: FC = () => {
    const { data, isError, isLoading } = useGetSlack();
    const { mutate: deleteSlack } = useDeleteSlack();

    const { user } = useApp();

    const installUrl = `/api/v1/slack/install/${user.data?.organizationUuid}`;

    if (isLoading) {
        return <Spinner />;
    }

    const isValidSlack = data?.slackTeamName !== undefined && !isError;
    return (
        <SlackSettingsWrapper>
            <SlackIcon src={slackSvg} />
            <AppearancePanelWrapper>
                <Title> Slack integration</Title>

                {isValidSlack && (
                    <Description>
                        Added to the <SlackName>{data.slackTeamName}</SlackName>{' '}
                        slack workspace.
                    </Description>
                )}

                <Description>
                    Sharing in Slack allows you to unfurl Lightdash URLs in your
                    workspace.{' '}
                    <a href="https://docs.lightdash.com/guides/sharing-in-slack">
                        View docs
                    </a>
                </Description>
            </AppearancePanelWrapper>
            {isValidSlack ? (
                <Actions>
                    <AnchorButton
                        target="_blank"
                        intent="primary"
                        href={installUrl}
                    >
                        Reinstall
                    </AnchorButton>
                    <Button
                        icon="delete"
                        intent="danger"
                        onClick={deleteSlack}
                        text="Remove"
                    />
                </Actions>
            ) : (
                <Actions>
                    <AnchorButton
                        intent="primary"
                        target="_blank"
                        href={installUrl}
                    >
                        Add to Slack
                    </AnchorButton>
                </Actions>
            )}
        </SlackSettingsWrapper>
    );
};

export default SlackSettingsPanel;
