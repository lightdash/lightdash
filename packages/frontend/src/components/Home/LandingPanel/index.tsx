import { FC } from 'react';
import SpaceBrowser from '../../Explorer/SpaceBrowser';
import LatestDashboards from '../LatestDashboards';
import LatestSavedCharts from '../LatestSavedCharts';
import {
    Intro,
    LandingHeaderWrapper,
    LandingPanelWrapper,
    StyledLinkButton,
    Title,
    WelcomeText,
} from './LandingPanel.styles';

interface Props {
    userName: string | undefined;
    projectUuid: string;
    hasSavedChart: boolean;
}

const LandingPanel: FC<Props> = ({ userName, projectUuid, hasSavedChart }) => {
    return (
        <LandingPanelWrapper>
            <LandingHeaderWrapper>
                <WelcomeText>
                    <Title>
                        {`Welcome${
                            userName ? ', ' + userName : ' to Lightdash'
                        }! ⚡`}
                    </Title>

                    <Intro>
                        Run a query to ask a business question or browse your
                        data below:
                    </Intro>
                </WelcomeText>

                <StyledLinkButton
                    large
                    href={`/projects/${projectUuid}/tables`}
                    intent="primary"
                    icon="series-search"
                >
                    Run a query
                </StyledLinkButton>
            </LandingHeaderWrapper>

            <SpaceBrowser projectUuid={projectUuid} />

            {hasSavedChart && <LatestDashboards projectUuid={projectUuid} />}

            <LatestSavedCharts projectUuid={projectUuid} />
        </LandingPanelWrapper>
    );
};

export default LandingPanel;
