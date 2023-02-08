import { AnchorButton, Button, Spinner } from '@blueprintjs/core';
import { slackRequiredScopes, SlackSettings } from '@lightdash/common';
import intersection from 'lodash-es/intersection';
import React, { FC } from 'react';
import { useDeleteSlack, useGetSlack } from '../../../hooks/useSlack';
import slackSvg from '../../../svgs/slack.svg';
import {
    Actions,
    AppearancePanelWrapper,
    Description,
    ScopesCallout,
    SlackIcon,
    SlackName,
    SlackSettingsWrapper,
    Title,
} from './SlackSettingsPanel.styles';

export const hasRequiredScopes = (slackSettings: SlackSettings) => {
    return (
        intersection(slackSettings.scopes, slackRequiredScopes).length ===
        slackRequiredScopes.length
    );
};
const SlackSettingsPanel: FC = () => {
    const { data, isError, isLoading } = useGetSlack();
    const { mutate: deleteSlack } = useDeleteSlack();

    const installUrl = `/api/v1/slack/install/`;

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
                <div>
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
                            onClick={() => deleteSlack(undefined)}
                            text="Remove"
                        />
                    </Actions>
                    {data && !hasRequiredScopes(data) && (
                        <ScopesCallout intent="primary">
                            Your Slack integration is not up to date, you should
                            reinstall the Slack integration to guaranty the best
                            user experience.
                        </ScopesCallout>
                    )}
                </div>
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
