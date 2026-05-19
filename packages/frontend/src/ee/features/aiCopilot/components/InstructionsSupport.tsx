import { Grid, Group, HoverCard, Paper, Text, Title } from '@mantine-8/core';
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
    <HoverCard>
        <HoverCard.Target>
            <Paper variant="dotted" p="xs" style={{ cursor: 'help' }}>
                <Group align="center" gap="xs">
                    <MantineIcon icon={icon} size={20} color="gray" />
                    <Title order={6} c="ldGray.7" size="xs">
                        {title}
                    </Title>
                </Group>
            </Paper>
        </HoverCard.Target>
        <HoverCard.Dropdown maw={200}>
            <Text size="xs">{description}</Text>
        </HoverCard.Dropdown>
    </HoverCard>
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
    <Grid gutter="xs">
        {guidelines.map((guideline) => (
            <Grid.Col span={3} key={guideline.title}>
                <InstructionsGuidelinesItem {...guideline} />
            </Grid.Col>
        ))}
    </Grid>
);
