import { Colors, Icon, InputGroup, Intent, Spinner } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { useApp } from '../../../providers/AppProvider';
import { InputWrapper } from '../../ChartConfigPanel/ChartConfigPanel.styles';
import { Can, useAbilityContext } from '../../common/Authorization';
import {
    AppearancePanelWrapper,
    ColorPalette,
    ColorSquare,
    ColorSquareInner,
    SaveButton,
    Title,
} from './SlackSettingsPanel.styles';

const SlackSettingsPanel: FC = () => {
    const ability = useAbilityContext();
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
                <a
                    href={`/api/v1/slack/install/${user.data?.organizationUuid}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <img
                        alt="Add to Slack"
                        height="40"
                        width="139"
                        src="https://platform.slack-edge.com/img/add_to_slack.png"
                        srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
                    />
                </a>
            </div>
        </AppearancePanelWrapper>
    );
};

export default SlackSettingsPanel;
