import { Icon } from '@blueprintjs/core';
import {
    Button,
    ColorInput,
    Input,
    NumberInput,
    Select,
    Stack,
} from '@mantine/core';
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

            <Stack my="md" w={300}>
                <Input.Wrapper label="Select colour">
                    <ColorInput />
                </Input.Wrapper>

                <Input.Wrapper label="Choose number">
                    <NumberInput placeholder="pick any number you want" />
                </Input.Wrapper>

                <Input.Wrapper label="Choose number">
                    <Select
                        placeholder="Pick one"
                        data={[
                            { value: 'lightdash', label: 'Lightdash' },
                            { value: 'looker', label: 'Looker' },
                            { value: 'metabase', label: 'Metabase' },
                            { value: 'excel', label: 'Excel' },
                        ]}
                    ></Select>
                </Input.Wrapper>

                <Button
                    color="green"
                    size="xs"
                    sx={{ alignSelf: 'flex-start' }}
                    leftIcon={<Icon icon="series-search" />}
                >
                    Can I run a query?
                </Button>
            </Stack>

            <SpaceBrowser projectUuid={projectUuid} />

            {hasSavedChart && <LatestDashboards projectUuid={projectUuid} />}

            <LatestSavedCharts projectUuid={projectUuid} />
        </LandingPanelWrapper>
    );
};

export default LandingPanel;
