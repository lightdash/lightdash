import { Group, SimpleGrid, Stack, Text } from '@mantine/core';
import {
    IconBuilding,
    IconChartBar,
    IconTarget,
    IconUser,
} from '@tabler/icons-react';
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
            <Text size="xs" fw={600} c="ldGray.9">
                {title}
            </Text>
            <Text size="xs" c="dimmed">
                {description}
            </Text>
        </Stack>
    </Group>
);

const guidelines = [
    {
        icon: IconTarget,
        title: 'Domain knowledge',
        description:
            'Specify the industry, field, or subject matter expertise. Include relevant methodologies, frameworks, and technical knowledge.',
    },
    {
        icon: IconBuilding,
        title: 'Company context',
        description:
            'Include relevant business context, goals, and constraints. Mention industry, target audience, and strategic objectives.',
    },
    {
        icon: IconChartBar,
        title: 'Analysis preferences',
        description:
            'Define how data should be analyzed and presented. Specify preferred metrics, dimensions, visualization types, and reporting formats.',
    },
    {
        icon: IconUser,
        title: 'Role & expertise',
        description:
            "Describe the analyst's role, responsibilities, and expertise level. Define communication style and decision-making authority.",
    },
];

export const InstructionsGuidelines = () => (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="sm">
        {guidelines.map((guideline) => (
            <InstructionsGuidelinesItem key={guideline.title} {...guideline} />
        ))}
    </SimpleGrid>
);
