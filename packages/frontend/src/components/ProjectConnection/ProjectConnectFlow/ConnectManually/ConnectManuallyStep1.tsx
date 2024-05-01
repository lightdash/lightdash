import { Button, Stack, Text, Tooltip } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { useApp } from '../../../../providers/AppProvider';
import { useTracking } from '../../../../providers/TrackingProvider';
import { EventName } from '../../../../types/Events';
import MantineIcon from '../../../common/MantineIcon';
import { ProjectCreationCard } from '../../../common/Settings/SettingsCard';
import { OnboardingConnectTitle } from '../common/OnboardingTitle';
import OnboardingWrapper from '../common/OnboardingWrapper';

const codeBlock = String.raw`
models:
  - name: my_model
    columns:
      - name: my_column_1
      - name: my_column_2
`;

interface ConnectManuallyStep1Props {
    isCreatingFirstProject: boolean;
    onBack: () => void;
    onForward: () => void;
}

const ConnectManuallyStep1: FC<ConnectManuallyStep1Props> = ({
    isCreatingFirstProject,
    onBack,
    onForward,
}) => {
    const { track } = useTracking();
    const { health } = useApp();
    return (
        <OnboardingWrapper>
            <Button
                pos="absolute"
                variant="subtle"
                size="sm"
                top={-50}
                leftIcon={<MantineIcon icon={IconChevronLeft} />}
                onClick={onBack}
            >
                Back
            </Button>

            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text color="dimmed">
                        We strongly recommend that you define columns in your
                        .yml to see a table in Lightdash. eg:
                    </Text>

                    <Prism ta="left" noCopy language="yaml">
                        {codeBlock}
                    </Prism>

                    <Stack spacing="xs">
                        <Tooltip
                            position="top"
                            label={
                                'Add the columns you want to explore to your .yml files in your dbt project. Click to view docs.'
                            }
                        >
                            <Button
                                component="a"
                                variant="outline"
                                href={`${health.data?.siteHelpdeskUrl}/guides/how-to-create-dimensions`}
                                target="_blank"
                                rel="noreferrer noopener"
                                rightIcon={
                                    <MantineIcon icon={IconChevronRight} />
                                }
                                onClick={() => {
                                    track({
                                        name: EventName.DOCUMENTATION_BUTTON_CLICKED,
                                        properties: {
                                            action: 'define_metrics',
                                        },
                                    });
                                }}
                            >
                                Learn how to define them
                            </Button>
                        </Tooltip>

                        <Button onClick={onForward}>I’ve defined them!</Button>
                    </Stack>
                </Stack>
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};

export default ConnectManuallyStep1;
