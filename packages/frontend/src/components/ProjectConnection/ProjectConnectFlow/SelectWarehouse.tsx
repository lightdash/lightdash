import { assertUnreachable } from '@lightdash/common';
import { Avatar, SimpleGrid, Stack, Text } from '@mantine/core';
import { FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';

import OnboardingButton from './common/OnboardingButton';
import { OnboardingConnectTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';
import { WarehouseTypeLabels } from './constants';
import InviteExpertFooter from './InviteExpertFooter';

export type SelectedWarehouse = typeof WarehouseTypeLabels[number]['key'];

export const WarehouseIcon: FC<{ key: SelectedWarehouse; size?: string }> = ({
    key,
    size = 'md',
}) => {
    const item = WarehouseTypeLabels.find((w) => w.key === key);
    if (!item) return null;

    switch (item.iconType) {
        case 'image':
            return <Avatar size={size} src={item.image} alt={item.label} />;
        case 'icon':
            return (
                <Avatar radius="xl" size={size} bg="transparent">
                    <MantineIcon size={size} icon={item.Icon} />
                </Avatar>
            );
        default:
            return assertUnreachable(item, 'Unknown icon type');
    }
};

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
                                leftIcon={<WarehouseIcon key={item.key} />}
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
