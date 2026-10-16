import { Group, SimpleGrid, Stack, Text } from '@mantine/core';
import {
    IconBuilding,
    IconChartBar,
    IconTarget,
    IconUser,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import MantineIcon, {
    type MantineIconProps,
} from '../../../../components/common/MantineIcon';

const InstructionsGuidelinesItem = ({
    icon,
    title,
    description,
}: {
    icon: MantineIconProps['icon'];
    title: string;
    description: string;
}) => (
    <Group align="flex-start" gap="xs" wrap="nowrap">
        <MantineIcon icon={icon} size={16} color="gray" />
        <Stack gap={2}>
            <Text size="xs" fw={600}>
                {title}
            </Text>
            <Text size="xs" c="dimmed">
                {description}
            </Text>
        </Stack>
    </Group>
);

const guidelines = [
    { key: 'domainKnowledge', icon: IconTarget },
    { key: 'companyContext', icon: IconBuilding },
    { key: 'analysisPreferences', icon: IconChartBar },
    { key: 'roleExpertise', icon: IconUser },
] as const;

export const InstructionsGuidelines = () => {
    const { t } = useTranslation('aiAgent');
    return (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="sm">
            {guidelines.map(({ key, icon }) => (
                <InstructionsGuidelinesItem
                    key={key}
                    icon={icon}
                    title={t(`guidelines.${key}.title`)}
                    description={t(`guidelines.${key}.description`)}
                />
            ))}
        </SimpleGrid>
    );
};
