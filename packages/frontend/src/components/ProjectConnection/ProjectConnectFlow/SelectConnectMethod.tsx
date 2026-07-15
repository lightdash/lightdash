import { FeatureFlags } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine-8/core';
import { Avatar } from '@mantine/core';
import {
    IconChecklist,
    IconChevronLeft,
    IconChevronRight,
    IconDatabase,
    IconRobot,
    IconTerminal,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingButton from './common/OnboardingButton';
import { OnboardingConnectTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';
import { ConnectMethod } from './types';

interface SelectConnectMethodProps {
    isCreatingFirstProject: boolean;
    isCodingAgentOnboardingEnabled: boolean;
    onBack: () => void;
    onSelect: (method: ConnectMethod) => void;
}

const SelectConnectMethod: FC<SelectConnectMethodProps> = ({
    isCreatingFirstProject,
    isCodingAgentOnboardingEnabled,
    onSelect,
    onBack,
}) => {
    const { track } = useTracking();

    const warehouseConnectFlag = useServerFeatureFlag(
        FeatureFlags.WarehouseConnectOnboarding,
    );
    const isWarehouseConnectEnabled =
        warehouseConnectFlag.data?.enabled ?? false;

    return (
        <OnboardingWrapper>
            <Button
                pos="absolute"
                variant="subtle"
                size="sm"
                top={-50}
                leftSection={<MantineIcon icon={IconChevronLeft} />}
                onClick={onBack}
            >
                Back
            </Button>

            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text c="dimmed">
                        {isWarehouseConnectEnabled
                            ? 'To get started, choose how you want to connect:'
                            : 'To get started, choose how you want to upload your dbt project:'}
                    </Text>

                    <Stack>
                        {isCodingAgentOnboardingEnabled && (
                            <OnboardingButton
                                onClick={() => {
                                    track({
                                        name: EventName.CREATE_PROJECT_AGENT_BUTTON_CLICKED,
                                    });
                                    onSelect(ConnectMethod.AGENT);
                                }}
                                leftIcon={
                                    <Avatar radius="xl">
                                        <MantineIcon
                                            icon={IconRobot}
                                            color="black"
                                            size="lg"
                                        />
                                    </Avatar>
                                }
                                rightIcon={
                                    <MantineIcon
                                        icon={IconChevronRight}
                                        color="black"
                                    />
                                }
                                description="Connect your warehouse, then let your coding agent finish setup"
                            >
                                Using your coding agent
                            </OnboardingButton>
                        )}

                        <OnboardingButton
                            onClick={() => {
                                track({
                                    name: EventName.CREATE_PROJECT_CLI_BUTTON_CLICKED,
                                });
                                onSelect(ConnectMethod.CLI);
                            }}
                            leftIcon={
                                <Avatar radius="xl">
                                    <MantineIcon
                                        icon={IconTerminal}
                                        color="black"
                                        size="lg"
                                    />
                                </Avatar>
                            }
                            rightIcon={
                                <MantineIcon
                                    icon={IconChevronRight}
                                    color="black"
                                />
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
                            onClick={() => {
                                track({
                                    name: EventName.CREATE_PROJECT_MANUALLY_BUTTON_CLICKED,
                                });
                                onSelect(ConnectMethod.MANUAL);
                            }}
                            leftIcon={
                                <Avatar radius="xl">
                                    <MantineIcon
                                        icon={IconChecklist}
                                        color="black"
                                        size="lg"
                                    />
                                </Avatar>
                            }
                            rightIcon={
                                <MantineIcon
                                    icon={IconChevronRight}
                                    color="black"
                                />
                            }
                            description="Pull project from git repository"
                        >
                            Manually
                        </OnboardingButton>

                        {isWarehouseConnectEnabled && (
                            <OnboardingButton
                                onClick={() => {
                                    track({
                                        name: EventName.CREATE_PROJECT_WAREHOUSE_BUTTON_CLICKED,
                                    });
                                    onSelect(ConnectMethod.WAREHOUSE);
                                }}
                                leftIcon={
                                    <Avatar radius="xl">
                                        <MantineIcon
                                            icon={IconDatabase}
                                            color="black"
                                            size="lg"
                                        />
                                    </Avatar>
                                }
                                rightIcon={
                                    <MantineIcon
                                        icon={IconChevronRight}
                                        color="black"
                                    />
                                }
                                description="Fastest way to get started — connect directly and query your tables"
                            >
                                Connect to your warehouse
                            </OnboardingButton>
                        )}
                    </Stack>
                </Stack>
            </ProjectCreationCard>

            <Button
                component="a"
                variant="subtle"
                mx="auto"
                w="fit-content"
                target="_blank"
                rel="noreferrer noopener"
                href="https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready"
                onClick={() => {
                    track({
                        name: EventName.DOCUMENTATION_BUTTON_CLICKED,
                        properties: {
                            action: 'getting_started',
                        },
                    });
                }}
            >
                View docs
            </Button>
        </OnboardingWrapper>
    );
};

export default SelectConnectMethod;
