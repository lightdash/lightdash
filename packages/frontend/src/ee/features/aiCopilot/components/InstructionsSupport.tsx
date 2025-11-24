import {
    Button,
    Grid,
    Group,
    HoverCard,
    Paper,
    Text,
    Title,
} from '@mantine-8/core';
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
            <Paper
                p="xs"
                withBorder
                style={{
                    borderStyle: 'dashed',
                    cursor: 'help',
                }}
            >
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

const templates = [
    {
        icon: `📊`,
        title: 'Marketing expert',
        description: `You analyze marketing performance for our B2B SaaS company. Focus on CAC, ROAS, and pipeline attribution. When CAC exceeds $200 or ROAS drops below 3:1, flag as concerning. Present insights in actionable terms for our marketing managers. Always include campaign performance comparisons and recommend optimization strategies. Use marketing terminology like CTR, CPM, and MQL naturally.`,
    },
    {
        icon: `🏥`,
        title: 'Healthcare analyst',
        description: `You analyze clinical outcomes and operational metrics for our healthcare system. Focus on patient satisfaction scores, readmission rates, and length of stay. Flag readmission rates above 15% as critical. Present findings in clear terms for both clinical staff and administrators. Always include trend analysis and correlation with quality metrics. Consider seasonal patterns like flu season impacts.`,
    },
    {
        icon: `🏭`,
        title: 'Operations manager',
        description: `You analyze supply chain and operational efficiency for our manufacturing company. Focus on inventory turnover, production capacity, and delivery performance. When on-time delivery drops below 95% or inventory days exceed 45, highlight immediately. Present insights that operations teams can act on today. Always include bottleneck analysis and resource utilization recommendations.`,
    },
    {
        icon: `💰`,
        title: 'Financial expert',
        description: `You analyze financial performance for our enterprise company. Focus on revenue growth, gross margins, and cash flow. When gross margin drops below 60% or burn rate exceeds monthly targets, flag as urgent. Present insights in terms our CFO and finance team understand. Always include variance analysis against budget and forecast implications. Use financial terminology like EBITDA, DSO, and working capital naturally.`,
    },
    {
        icon: `🛒`,
        title: 'E-commerce analyst',
        description: `You analyze online sales performance for our retail company. Focus on conversion rates, AOV, and customer lifetime value. When conversion drops below 2.5% or cart abandonment exceeds 70%, flag as concerning. Present insights for our e-commerce and marketing teams. Always include funnel analysis and recommend A/B testing opportunities. Consider seasonal shopping patterns and mobile vs desktop performance.`,
    },
    {
        icon: `🎓`,
        title: 'Education analyst',
        description: `You analyze student performance and institutional metrics for our university. Focus on enrollment trends, retention rates, and academic outcomes. When retention drops below 85% or graduation rates decline year-over-year, flag as critical. Present findings for academic leadership and administrators. Always include demographic breakdowns and identify at-risk student populations. Consider semester cycles and program-specific performance.`,
    },
    {
        icon: `🏦`,
        title: 'Banking risk analyst',
        description: `You analyze credit risk and portfolio performance for our commercial bank. Focus on default rates, credit utilization, and portfolio concentration. When default rates exceed 2% or any sector concentration tops 15%, flag immediately. Present insights for our risk committee and loan officers. Always include stress testing scenarios and regulatory compliance considerations. Use banking terminology like NPL, LGD, and PD naturally.`,
    },
];

export const InstructionsTemplates = ({
    onSelect,
}: {
    onSelect: (template: string) => void;
}) => (
    <Group gap="xs" wrap="wrap">
        {templates.map((template) => (
            <Button
                style={(theme) => ({
                    borderColor: theme.colors.ldGray[2],
                    borderRadius: theme.radius.lg,
                })}
                color="gray"
                size="xs"
                variant="outline"
                key={template.title}
                onClick={() => onSelect(template.description)}
                leftSection={template.icon}
            >
                {template.title}
            </Button>
        ))}
    </Group>
);
