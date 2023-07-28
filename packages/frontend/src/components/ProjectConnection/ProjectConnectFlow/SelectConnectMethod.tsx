import { Avatar, Stack, Text } from '@mantine/core';
import { IconChecklist, IconTerminal } from '@tabler/icons-react';
import { FC } from 'react';
import { ConnectMethod } from '../../../pages/CreateProject';
import { FloatingBackButton } from '../../../pages/CreateProject.styles';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import ConnectTitle from './common/ConnectTitle';
import OnboardingButton from './common/OnboardingButton';
import { Wrapper } from './ProjectConnectFlow.styles';

interface SelectConnectMethodProps {
    isCreatingFirstProject: boolean;
    onBack: () => void;
    onSelect: (method: ConnectMethod) => void;
}

const SelectConnectMethod: FC<SelectConnectMethodProps> = ({
    isCreatingFirstProject,
    onSelect,
    onBack,
}) => {
    return (
        <Wrapper>
            <FloatingBackButton
                icon="chevron-left"
                text="Back"
                onClick={onBack}
            />

            <ProjectCreationCard>
                <Stack>
                    <ConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text color="dimmed">
                        To get started, choose how you want to upload your dbt
                        project:
                    </Text>

                    <Stack>
                        <OnboardingButton
                            onClick={() => onSelect(ConnectMethod.CLI)}
                            leftIcon={
                                <Avatar radius="xl">
                                    <MantineIcon
                                        icon={IconTerminal}
                                        color="black"
                                    />
                                </Avatar>
                            }
                            description={
                                <>
                                    with{' '}
                                    <Text span ff="monospace">
                                        `lightdash deploy`
                                    </Text>
                                </>
                            }
                        >
                            Using your CLI
                        </OnboardingButton>

                        <OnboardingButton
                            onClick={() => onSelect(ConnectMethod.MANUAL)}
                            leftIcon={
                                <Avatar radius="xl">
                                    <MantineIcon
                                        icon={IconChecklist}
                                        color="black"
                                    />
                                </Avatar>
                            }
                            description="Pull project from git repository"
                        >
                            Manually
                        </OnboardingButton>
                    </Stack>
                </Stack>
            </ProjectCreationCard>
        </Wrapper>
    );
};

export default SelectConnectMethod;
