import { AnchorButton, Button, Icon, Spinner } from '@blueprintjs/core';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { FC, useCallback, useEffect, useState } from 'react';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { useApp } from '../../../providers/AppProvider';
import {
    AppearancePanelWrapper,
    SlackButton,
    Title,
} from './SlackSettingsPanel.styles';

const SlackSettingsPanel: FC = () => {
    const { isLoading: isOrgLoading, data } = useOrganisation();
    const updateMutation = useOrganisationUpdateMutation();
    let [colors, setColors] = useState<string[]>(
        data?.chartColors || ECHARTS_DEFAULT_COLORS.slice(0, 8),
    );

    const { user } = useApp();

    const update = useCallback(() => {
        if (data)
            updateMutation.mutate({
                ...data,
                chartColors: colors,
            });
    }, [colors, data, updateMutation]);

    useEffect(() => {
        if (data?.chartColors) {
            setColors(data.chartColors);
        }
    }, [data]);

    if (isOrgLoading) {
        return <Spinner />;
    }

    return (
        <AppearancePanelWrapper>
            <Title>Slack</Title>
            <div>
                <SlackButton
                    minimal={true}
                    href={`/api/v1/slack/install/${user.data?.organizationUuid}`}
                    target="_blank"
                    icon={
                        <img
                            alt="Add to Slack"
                            src="https://platform.slack-edge.com/img/add_to_slack.png"
                        />
                    }
                />
            </div>
        </AppearancePanelWrapper>
    );
};

export default SlackSettingsPanel;
