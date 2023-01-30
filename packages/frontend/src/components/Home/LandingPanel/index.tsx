import { FC } from 'react';
import {
    Intro,
    LandingHeaderWrapper,
    StyledLinkButton,
    Title,
    WelcomeText,
} from './LandingPanel.styles';

interface Props {
    userName: string | undefined;
    projectUuid: string;
}

const LandingPanel: FC<Props> = ({ userName, projectUuid }) => {
    return (
        <LandingHeaderWrapper>
            <WelcomeText>
                <Title>
                    {`Welcome${
                        userName ? ', ' + userName : ' to Lightdash'
                    }! ⚡`}
                </Title>

                <Intro>
                    Run a query to ask a business question or browse your data
                    below:
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
    );
};

export default LandingPanel;
