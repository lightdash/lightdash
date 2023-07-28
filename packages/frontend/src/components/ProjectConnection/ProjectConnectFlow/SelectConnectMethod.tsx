import { Avatar, Button, Stack, Text } from '@mantine/core';
import {
    IconChecklist,
    IconChevronLeft,
    IconTerminal,
} from '@tabler/icons-react';
import { FC } from 'react';
import { ConnectMethod } from '../../../pages/CreateProject';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingButton from './common/OnboardingButton';
import { OnboardingConnectTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';

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
        <OnboardingWrapper>
            <Button
                pos="absolute"
                variant="subtle"
                size="sm"
                top={-40}
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
        </OnboardingWrapper>
    );
};

export default SelectConnectMethod;
