import { FeatureFlags } from '@lightdash/common';
import { Button, Stack, Text, Avatar } from '@mantine/core';
import {
    IconChecklist,
    IconChevronLeft,
    IconChevronRight,
    IconDatabase,
    IconRobot,
    IconTerminal,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('projectConnection');
    const { track } = useTracking();

    const warehouseConnectFlag = useServerFeatureFlag(
        FeatureFlags.NewOnboarding,
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
                {t('actions.back', { ns: 'common' })}
            </Button>

            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text c="dimmed">
                        {isWarehouseConnectEnabled
                            ? t('connectFlow.method.promptConnect')
                            : t('connectFlow.method.promptUpload')}
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
                                description={t(
                                    'connectFlow.method.agentDescription',
                                )}
                            >
                                {t('connectFlow.method.agent')}
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
                                <Trans
                                    t={t}
                                    i18nKey="connectFlow.method.cliDescription"
                                    components={{
                                        command: <Text span ff="monospace" />,
                                    }}
                                />
                            }
                        >
                            {t('connectFlow.method.cli')}
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
                            description={t(
                                'connectFlow.method.manualDescription',
                            )}
                        >
                            {t('connectFlow.method.manual')}
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
                                description={t(
                                    'connectFlow.method.warehouseDescription',
                                )}
                            >
                                {t('connectFlow.method.warehouse')}
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
                {t('connectFlow.viewDocs')}
            </Button>
        </OnboardingWrapper>
    );
};

export default SelectConnectMethod;
