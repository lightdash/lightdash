import { SimpleGrid, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import InviteExpertFooter from './InviteExpertFooter';
import OnboardingButton from './common/OnboardingButton';
import { OnboardingConnectTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';
import { type SelectedWarehouse } from './types';
import { WarehouseTypeLabels, getWarehouseIcon } from './utils';

interface SelectWarehouseProps {
    isCreatingFirstProject: boolean;
    onSelect: (warehouse: SelectedWarehouse) => void;
}

const SelectWarehouse: FC<SelectWarehouseProps> = ({
    isCreatingFirstProject,
    onSelect,
}) => {
    return (
        <OnboardingWrapper>
            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text color="dimmed">Select your warehouse:</Text>

                    <SimpleGrid cols={2} spacing="sm">
                        {WarehouseTypeLabels.map((item) => (
                            <OnboardingButton
                                key={item.key}
                                leftIcon={getWarehouseIcon(item.key)}
                                onClick={() => onSelect(item.key)}
                            >
                                {item.label}
                            </OnboardingButton>
                        ))}
                    </SimpleGrid>
                </Stack>
            </ProjectCreationCard>

            <InviteExpertFooter />
        </OnboardingWrapper>
    );
};

export default SelectWarehouse;
