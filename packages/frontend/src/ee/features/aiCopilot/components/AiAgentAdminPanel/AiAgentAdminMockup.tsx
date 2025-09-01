import {
    ActionIcon,
    Avatar,
    Badge,
    Box,
    Button,
    Divider,
    Drawer,
    Flex,
    Grid,
    Group,
    Paper,
    ScrollArea,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Table,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconBrain,
    IconCalendar,
    IconChartBar,
    IconChevronDown,
    IconEdit,
    IconExternalLink,
    IconFilter,
    IconSearch,
    IconSettings,
    IconThumbDown,
    IconThumbUp,
    IconTrendingDown,
    IconTrendingUp,
    IconX,
} from '@tabler/icons-react';
import ReactECharts from 'echarts-for-react';
import { useEffect, useRef, useState } from 'react';

// Mock data generation
const generateMockAgents = () => [
    {
        uuid: 'agent-1',
        name: 'Sales Analytics Assistant',
        projectName: 'Revenue Dashboard',
        projectUuid: 'proj-1',
        tags: ['sales', 'revenue', 'kpi'],
        userAccess: ['john.doe@company.com', 'jane.smith@company.com'],
        groupAccess: ['Sales Team', 'Executive Team'],
        status: 'active',
        conversations: 1234,
        satisfaction: 4.2,
        lastActive: '2 hours ago',
    },
    {
        uuid: 'agent-2',
        name: 'Marketing Insights Bot',
        projectName: 'Marketing Analytics',
        projectUuid: 'proj-2',
        tags: ['marketing', 'campaigns', 'roi'],
        userAccess: ['marketing.lead@company.com'],
        groupAccess: ['Marketing Team'],
        status: 'active',
        conversations: 892,
        satisfaction: 4.5,
        lastActive: '30 minutes ago',
    },
    {
        uuid: 'agent-3',
        name: 'Customer Support Helper',
        projectName: 'Support Metrics',
        projectUuid: 'proj-3',
        tags: ['support', 'customer', 'tickets'],
        userAccess: [],
        groupAccess: ['Support Team', 'QA Team'],
        status: 'active',
        conversations: 2341,
        satisfaction: 3.8,
        lastActive: '1 hour ago',
    },
    {
        uuid: 'agent-4',
        name: 'Financial Reporter',
        projectName: 'Finance Dashboard',
        projectUuid: 'proj-1',
        tags: ['finance', 'reporting', 'compliance'],
        userAccess: ['cfo@company.com'],
        groupAccess: ['Finance Team', 'Executive Team'],
        status: 'inactive',
        conversations: 456,
        satisfaction: 4.7,
        lastActive: '2 days ago',
    },
    {
        uuid: 'agent-5',
        name: 'Product Analytics Guide',
        projectName: 'Product Metrics',
        projectUuid: 'proj-4',
        tags: ['product', 'usage', 'features'],
        userAccess: ['product.team@company.com'],
        groupAccess: ['Product Team', 'Engineering Team'],
        status: 'active',
        conversations: 678,
        satisfaction: 4.1,
        lastActive: '15 minutes ago',
    },
];

// Generate detailed conversation messages
const generateConversationDetails = (conversationId: string) => {
    const conversations = {
        'conv-1': {
            messages: [
                {
                    id: 'msg-1',
                    type: 'user',
                    content: 'What were our Q3 sales by region?',
                    timestamp: '2024-01-15 10:30 AM',
                    user: 'John Doe',
                },
                {
                    id: 'msg-2',
                    type: 'agent',
                    content:
                        "I'll analyze the Q3 sales data by region for you.",
                    timestamp: '2024-01-15 10:30 AM',
                    hasChart: true,
                    chartType: 'bar',
                    chartConfig: {
                        title: 'Q3 2024 Sales by Region',
                        data: [
                            { region: 'North America', sales: 245000 },
                            { region: 'Europe', sales: 180000 },
                            { region: 'Asia Pacific', sales: 165000 },
                            { region: 'Latin America', sales: 95000 },
                        ],
                    },
                },
            ],
        },
        'conv-2': {
            messages: [
                {
                    id: 'msg-3',
                    type: 'user',
                    content: 'Show me campaign ROI for last month',
                    timestamp: '2024-01-15 10:25 AM',
                    user: 'Jane Smith',
                },
                {
                    id: 'msg-4',
                    type: 'agent',
                    content:
                        "Here's the campaign ROI analysis for December 2024. I've calculated the ROI for each campaign channel.",
                    timestamp: '2024-01-15 10:25 AM',
                    hasChart: true,
                    chartType: 'line',
                    chartConfig: {
                        title: 'Campaign ROI - December 2024',
                        data: [
                            {
                                campaign: 'Google Ads',
                                roi: 3.2,
                                spend: 45000,
                                revenue: 144000,
                            },
                            {
                                campaign: 'Facebook',
                                roi: 2.8,
                                spend: 32000,
                                revenue: 89600,
                            },
                            {
                                campaign: 'LinkedIn',
                                roi: 4.1,
                                spend: 18000,
                                revenue: 73800,
                            },
                            {
                                campaign: 'Email',
                                roi: 5.5,
                                spend: 12000,
                                revenue: 66000,
                            },
                        ],
                    },
                },
            ],
        },
        'conv-3': {
            messages: [
                {
                    id: 'msg-5',
                    type: 'user',
                    content: 'How many tickets were resolved yesterday?',
                    timestamp: '2024-01-15 10:20 AM',
                    user: 'Mike Wilson',
                },
                {
                    id: 'msg-6',
                    type: 'agent',
                    content:
                        "Yesterday (January 14th), our support team resolved 127 tickets. Here's the breakdown by priority and resolution time.",
                    timestamp: '2024-01-15 10:20 AM',
                    hasTable: true,
                    tableData: {
                        title: 'Ticket Resolution Summary - Jan 14, 2024',
                        headers: [
                            'Priority',
                            'Tickets Resolved',
                            'Avg Resolution Time',
                            'SLA Met',
                        ],
                        rows: [
                            ['Critical', '8', '45 mins', '100%'],
                            ['High', '23', '2.3 hours', '95%'],
                            ['Medium', '67', '4.2 hours', '98%'],
                            ['Low', '29', '1.2 days', '85%'],
                        ],
                    },
                },
            ],
        },
        'conv-4': {
            messages: [
                {
                    id: 'msg-7',
                    type: 'user',
                    content: 'Compare YoY growth for enterprise accounts',
                    timestamp: '2024-01-15 10:15 AM',
                    user: 'Sarah Johnson',
                },
                {
                    id: 'msg-8',
                    type: 'agent',
                    content:
                        'I encountered an issue accessing the enterprise accounts data. The query timed out after 30 seconds. This might be due to the large dataset size or a database performance issue.',
                    timestamp: '2024-01-15 10:15 AM',
                    isError: true,
                    errorDetails: {
                        type: 'Query Timeout',
                        message:
                            'The database query exceeded the 30-second timeout limit',
                        suggestions: [
                            'Try narrowing the date range',
                            'Filter by specific account segments',
                            'Contact admin if issue persists',
                        ],
                    },
                },
            ],
        },
    };

    return (
        conversations[conversationId as keyof typeof conversations] || {
            messages: [],
        }
    );
};

// Generate more comprehensive conversation data for admin view
const generateAllConversations = () => {
    const baseConversations = [
        {
            uuid: 'conv-1',
            agentName: 'Sales Analytics Assistant',
            projectName: 'Revenue Dashboard',
            userName: 'John Doe',
            question: 'What were our Q3 sales by region?',
            timestamp: '2024-01-15 10:30 AM',
            responseTime: '2.3s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-2',
            agentName: 'Marketing Insights Bot',
            projectName: 'Marketing Analytics',
            userName: 'Jane Smith',
            question: 'Show me campaign ROI for last month',
            timestamp: '2024-01-15 10:25 AM',
            responseTime: '1.8s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-3',
            agentName: 'Customer Support Helper',
            projectName: 'Support Metrics',
            userName: 'Mike Wilson',
            question: 'How many tickets were resolved yesterday?',
            timestamp: '2024-01-15 10:20 AM',
            responseTime: '3.1s',
            feedback: null,
            status: 'completed',
        },
        {
            uuid: 'conv-4',
            agentName: 'Sales Analytics Assistant',
            projectName: 'Revenue Dashboard',
            userName: 'Sarah Johnson',
            question: 'Compare YoY growth for enterprise accounts',
            timestamp: '2024-01-15 10:15 AM',
            responseTime: 'timeout',
            feedback: 'negative',
            status: 'failed',
        },
        {
            uuid: 'conv-5',
            agentName: 'Financial Reporter',
            projectName: 'Finance Dashboard',
            userName: 'CFO User',
            question: 'Generate monthly P&L statement',
            timestamp: '2024-01-15 10:10 AM',
            responseTime: '5.1s',
            feedback: 'positive',
            status: 'completed',
        },
    ];

    // Generate additional conversations for a more comprehensive dataset
    const additionalConversations = [
        {
            uuid: 'conv-6',
            agentName: 'Product Analytics Guide',
            projectName: 'Product Metrics',
            userName: 'Product Manager',
            question: 'What features have the highest adoption rate?',
            timestamp: '2024-01-15 09:55 AM',
            responseTime: '2.7s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-7',
            agentName: 'Marketing Insights Bot',
            projectName: 'Marketing Analytics',
            userName: 'Marketing Lead',
            question: 'Show me email campaign performance metrics',
            timestamp: '2024-01-15 09:50 AM',
            responseTime: '1.9s',
            feedback: null,
            status: 'completed',
        },
        {
            uuid: 'conv-8',
            agentName: 'Customer Support Helper',
            projectName: 'Support Metrics',
            userName: 'Support Agent',
            question: 'Average resolution time by category?',
            timestamp: '2024-01-15 09:45 AM',
            responseTime: 'timeout',
            feedback: 'negative',
            status: 'failed',
        },
        {
            uuid: 'conv-9',
            agentName: 'Sales Analytics Assistant',
            projectName: 'Revenue Dashboard',
            userName: 'Alice Cooper',
            question: 'Top performing sales reps this quarter',
            timestamp: '2024-01-15 09:40 AM',
            responseTime: '1.5s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-10',
            agentName: 'Marketing Insights Bot',
            projectName: 'Marketing Analytics',
            userName: 'Bob Wilson',
            question: 'Customer acquisition cost trends',
            timestamp: '2024-01-15 09:35 AM',
            responseTime: '2.1s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-11',
            agentName: 'Financial Reporter',
            projectName: 'Finance Dashboard',
            userName: 'Carol Davis',
            question: 'Budget variance analysis for Q4',
            timestamp: '2024-01-15 09:30 AM',
            responseTime: '3.8s',
            feedback: null,
            status: 'completed',
        },
        {
            uuid: 'conv-12',
            agentName: 'Product Analytics Guide',
            projectName: 'Product Metrics',
            userName: 'David Kim',
            question: 'Feature usage by user segment',
            timestamp: '2024-01-15 09:25 AM',
            responseTime: '2.4s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-13',
            agentName: 'Customer Support Helper',
            projectName: 'Support Metrics',
            userName: 'Eva Martinez',
            question: 'Customer satisfaction scores by product',
            timestamp: '2024-01-15 09:20 AM',
            responseTime: '4.2s',
            feedback: 'negative',
            status: 'completed',
        },
        {
            uuid: 'conv-14',
            agentName: 'Sales Analytics Assistant',
            projectName: 'Revenue Dashboard',
            userName: 'Frank Miller',
            question: 'Revenue forecast for next quarter',
            timestamp: '2024-01-15 09:15 AM',
            responseTime: '6.1s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-15',
            agentName: 'Marketing Insights Bot',
            projectName: 'Marketing Analytics',
            userName: 'Grace Lee',
            question: 'Social media engagement metrics',
            timestamp: '2024-01-15 09:10 AM',
            responseTime: 'timeout',
            feedback: 'negative',
            status: 'failed',
        },
        {
            uuid: 'conv-16',
            agentName: 'Financial Reporter',
            projectName: 'Finance Dashboard',
            userName: 'Henry Brown',
            question: 'Cash flow projections for 2024',
            timestamp: '2024-01-15 09:05 AM',
            responseTime: '3.5s',
            feedback: null,
            status: 'completed',
        },
        {
            uuid: 'conv-17',
            agentName: 'Product Analytics Guide',
            projectName: 'Product Metrics',
            userName: 'Iris Chen',
            question: 'User retention cohort analysis',
            timestamp: '2024-01-15 09:00 AM',
            responseTime: '2.9s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-18',
            agentName: 'Customer Support Helper',
            projectName: 'Support Metrics',
            userName: 'Jack Taylor',
            question: 'Support ticket volume by hour',
            timestamp: '2024-01-15 08:55 AM',
            responseTime: '1.7s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-19',
            agentName: 'Sales Analytics Assistant',
            projectName: 'Revenue Dashboard',
            userName: 'Kate Johnson',
            question: 'Pipeline velocity by sales stage',
            timestamp: '2024-01-15 08:50 AM',
            responseTime: '3.3s',
            feedback: null,
            status: 'completed',
        },
        {
            uuid: 'conv-20',
            agentName: 'Marketing Insights Bot',
            projectName: 'Marketing Analytics',
            userName: 'Luke White',
            question: 'Attribution model comparison',
            timestamp: '2024-01-15 08:45 AM',
            responseTime: 'timeout',
            feedback: 'negative',
            status: 'failed',
        },
        {
            uuid: 'conv-21',
            agentName: 'Financial Reporter',
            projectName: 'Finance Dashboard',
            userName: 'Mia Rodriguez',
            question: 'Department budget utilization',
            timestamp: '2024-01-15 08:40 AM',
            responseTime: '2.6s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-22',
            agentName: 'Product Analytics Guide',
            projectName: 'Product Metrics',
            userName: 'Nick Green',
            question: 'A/B test results summary',
            timestamp: '2024-01-15 08:35 AM',
            responseTime: '4.1s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-23',
            agentName: 'Customer Support Helper',
            projectName: 'Support Metrics',
            userName: 'Olivia Black',
            question: 'First response time by priority',
            timestamp: '2024-01-15 08:30 AM',
            responseTime: '1.3s',
            feedback: null,
            status: 'completed',
        },
        {
            uuid: 'conv-24',
            agentName: 'Sales Analytics Assistant',
            projectName: 'Revenue Dashboard',
            userName: 'Peter Gray',
            question: 'Win rate by competitor',
            timestamp: '2024-01-15 08:25 AM',
            responseTime: '5.7s',
            feedback: 'positive',
            status: 'completed',
        },
        {
            uuid: 'conv-25',
            agentName: 'Marketing Insights Bot',
            projectName: 'Marketing Analytics',
            userName: 'Quinn Adams',
            question: 'Content engagement by channel',
            timestamp: '2024-01-15 08:20 AM',
            responseTime: '2.2s',
            feedback: 'negative',
            status: 'completed',
        },
    ];

    return [...baseConversations, ...additionalConversations];
};

const generateMockConversations = () => generateAllConversations().slice(0, 8); // For the recent conversations view

const projects = [
    { value: 'all', label: 'All Projects' },
    { value: 'proj-1', label: 'Revenue Dashboard' },
    { value: 'proj-2', label: 'Marketing Analytics' },
    { value: 'proj-3', label: 'Support Metrics' },
    { value: 'proj-4', label: 'Product Metrics' },
];

const agents = [
    { value: 'all', label: 'All Agents' },
    { value: 'agent-1', label: 'Sales Analytics Assistant' },
    { value: 'agent-2', label: 'Marketing Insights Bot' },
    { value: 'agent-3', label: 'Customer Support Helper' },
    { value: 'agent-4', label: 'Financial Reporter' },
    { value: 'agent-5', label: 'Product Analytics Guide' },
];

// Generate analytics data based on filters
const generateAnalyticsData = (
    granularity: string,
    projectId: string,
    agentId: string,
) => {
    // Base data that changes based on selection
    const baseData = {
        organization: {
            conversations: 8432,
            queries: 24954,
            avgResponseTime: 2.7,
            satisfaction: 88,
            conversationTrend: [
                95, 120, 230, 235, 240, 238, 220, 180, 172, 195, 210, 225,
            ],
            responseTimes: [2.1, 2.3, 2.8, 3.2, 2.9, 2.4, 2.6, 2.5],
        },
        'proj-1': {
            conversations: 3421,
            queries: 9876,
            avgResponseTime: 2.4,
            satisfaction: 91,
            conversationTrend: [45, 55, 89, 92, 95, 98, 85, 72, 68, 75, 82, 88],
            responseTimes: [1.9, 2.1, 2.5, 2.8, 2.6, 2.2, 2.3, 2.3],
        },
        'proj-2': {
            conversations: 2156,
            queries: 6543,
            avgResponseTime: 2.9,
            satisfaction: 85,
            conversationTrend: [30, 35, 68, 70, 72, 70, 65, 58, 54, 60, 63, 67],
            responseTimes: [2.5, 2.7, 3.1, 3.5, 3.2, 2.8, 2.9, 2.9],
        },
        'proj-3': {
            conversations: 1876,
            queries: 5234,
            avgResponseTime: 3.1,
            satisfaction: 83,
            conversationTrend: [15, 20, 42, 45, 48, 46, 40, 35, 33, 38, 40, 42],
            responseTimes: [2.8, 3.0, 3.4, 3.8, 3.5, 3.1, 3.2, 3.2],
        },
        'proj-4': {
            conversations: 979,
            queries: 3301,
            avgResponseTime: 2.8,
            satisfaction: 89,
            conversationTrend: [5, 10, 31, 28, 25, 24, 30, 15, 17, 22, 25, 28],
            responseTimes: [2.3, 2.5, 2.9, 3.3, 3.0, 2.6, 2.7, 2.7],
        },
        'agent-1': {
            conversations: 1234,
            queries: 3567,
            avgResponseTime: 2.3,
            satisfaction: 92,
            conversationTrend: [20, 25, 45, 48, 50, 49, 43, 38, 35, 40, 42, 45],
            responseTimes: [1.8, 2.0, 2.4, 2.7, 2.5, 2.1, 2.2, 2.2],
        },
        'agent-2': {
            conversations: 892,
            queries: 2456,
            avgResponseTime: 1.8,
            satisfaction: 95,
            conversationTrend: [15, 18, 35, 37, 38, 37, 33, 28, 26, 30, 32, 34],
            responseTimes: [1.5, 1.7, 2.0, 2.3, 2.1, 1.8, 1.9, 1.9],
        },
        'agent-3': {
            conversations: 2341,
            queries: 6789,
            avgResponseTime: 3.1,
            satisfaction: 78,
            conversationTrend: [35, 40, 75, 78, 80, 78, 70, 60, 55, 62, 66, 70],
            responseTimes: [2.8, 3.0, 3.4, 3.8, 3.5, 3.1, 3.2, 3.2],
        },
        'agent-4': {
            conversations: 456,
            queries: 1234,
            avgResponseTime: 5.1,
            satisfaction: 94,
            conversationTrend: [5, 7, 15, 16, 17, 16, 14, 10, 8, 11, 12, 14],
            responseTimes: [4.5, 4.8, 5.4, 5.9, 5.6, 5.0, 5.1, 5.1],
        },
        'agent-5': {
            conversations: 678,
            queries: 1890,
            avgResponseTime: 2.7,
            satisfaction: 87,
            conversationTrend: [10, 13, 25, 27, 28, 27, 23, 18, 16, 20, 22, 24],
            responseTimes: [2.3, 2.5, 2.9, 3.3, 3.0, 2.6, 2.7, 2.7],
        },
    };

    let key = 'organization';
    if (granularity === 'project' && projectId !== 'all') {
        key = projectId;
    } else if (granularity === 'agent' && agentId !== 'all') {
        key = agentId;
    }

    return baseData[key as keyof typeof baseData] || baseData.organization;
};

export const AiAgentAdminMockup = () => {
    const [activeTab, setActiveTab] = useState('analytics');
    const [granularity, setGranularity] = useState('organization');
    const [selectedProject, setSelectedProject] = useState('all');
    const [selectedAgent, setSelectedAgent] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [timeRange, setTimeRange] = useState('7d');

    // Search input refs for keyboard shortcuts
    const conversationsSearchRef = useRef<HTMLInputElement>(null);
    const configSearchRef = useRef<HTMLInputElement>(null);

    // Configuration view specific filters
    const [configSearchQuery, setConfigSearchQuery] = useState('');
    const [configSelectedProject, setConfigSelectedProject] = useState('all');
    const [configSelectedStatus, setConfigSelectedStatus] = useState('all');
    const [configSortBy, setConfigSortBy] = useState('name');

    // Conversation sidebar state
    const [selectedConversation, setSelectedConversation] = useState<
        string | null
    >(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Conversations view specific filters
    const [conversationsSearchQuery, setConversationsSearchQuery] =
        useState('');
    const [conversationsSelectedProject, setConversationsSelectedProject] =
        useState('all');
    const [conversationsSelectedAgent, setConversationsSelectedAgent] =
        useState('all');
    const [conversationsSelectedStatus, setConversationsSelectedStatus] =
        useState('all');
    const [conversationsSelectedFeedback, setConversationsSelectedFeedback] =
        useState('all');
    const [conversationsSelectedUser, setConversationsSelectedUser] =
        useState('all');
    const [conversationsSortBy, setConversationsSortBy] = useState('recent');
    const [conversationsPage, setConversationsPage] = useState(1);
    const conversationsPerPage = 20;

    const mockAgents = generateMockAgents();
    const mockConversations = generateMockConversations();
    const allConversations = generateAllConversations();

    // Keyboard shortcuts for search functionality
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ctrl/Cmd + K to focus search in current tab
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                if (activeTab === 'conversations') {
                    conversationsSearchRef.current?.focus();
                } else if (activeTab === 'config') {
                    configSearchRef.current?.focus();
                }
            }
            // Escape to clear search
            if (
                event.key === 'Escape' &&
                document.activeElement?.tagName === 'INPUT'
            ) {
                if (activeTab === 'conversations' && conversationsSearchQuery) {
                    setConversationsSearchQuery('');
                } else if (activeTab === 'config' && configSearchQuery) {
                    setConfigSearchQuery('');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, conversationsSearchQuery, configSearchQuery]);

    // Get unique users for filtering
    const uniqueUsers = Array.from(
        new Set(allConversations.map((c) => c.userName)),
    )
        .sort()
        .map((user) => ({
            value: user.toLowerCase().replace(/\s+/g, ''),
            label: user,
        }));

    // Filter conversations based on selections
    const filteredConversations = mockConversations.filter((conv) => {
        if (selectedProject !== 'all') {
            const agent = mockAgents.find((a) => a.name === conv.agentName);
            if (agent?.projectUuid !== selectedProject) return false;
        }
        if (selectedAgent !== 'all') {
            const agent = mockAgents.find((a) => a.uuid === selectedAgent);
            if (agent?.name !== conv.agentName) return false;
        }
        if (searchQuery) {
            return conv.question
                .toLowerCase()
                .includes(searchQuery.toLowerCase());
        }
        return true;
    });

    // Filter agents based on configuration view filters
    const filteredConfigAgents = mockAgents
        .filter((agent) => {
            // Filter by project
            if (
                configSelectedProject !== 'all' &&
                agent.projectUuid !== configSelectedProject
            ) {
                return false;
            }

            // Filter by status
            if (
                configSelectedStatus !== 'all' &&
                agent.status !== configSelectedStatus
            ) {
                return false;
            }

            // Filter by search query
            if (configSearchQuery) {
                const searchTerms = configSearchQuery
                    .toLowerCase()
                    .trim()
                    .split(/\s+/)
                    .filter((term) => term.length > 0);

                if (searchTerms.length === 0) return true;

                // Check if all search terms match at least one field
                return searchTerms.every(
                    (searchTerm) =>
                        agent.name.toLowerCase().includes(searchTerm) ||
                        agent.projectName.toLowerCase().includes(searchTerm) ||
                        agent.status.toLowerCase().includes(searchTerm) ||
                        agent.lastActive.toLowerCase().includes(searchTerm) ||
                        agent.tags.some((tag) =>
                            tag.toLowerCase().includes(searchTerm),
                        ) ||
                        agent.userAccess.some((user) =>
                            user.toLowerCase().includes(searchTerm),
                        ) ||
                        agent.groupAccess.some((group) =>
                            group.toLowerCase().includes(searchTerm),
                        ),
                );
            }

            return true;
        })
        .sort((a, b) => {
            switch (configSortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'project':
                    return a.projectName.localeCompare(b.projectName);
                case 'conversations':
                    return b.conversations - a.conversations;
                case 'satisfaction':
                    return b.satisfaction - a.satisfaction;
                case 'lastActive':
                    // Simple sort by lastActive (would need proper date parsing in real implementation)
                    return a.lastActive.localeCompare(b.lastActive);
                default:
                    return 0;
            }
        });

    // Filter all conversations for the dedicated conversations view
    const filteredAllConversations = allConversations
        .filter((conv) => {
            // Filter by project
            if (conversationsSelectedProject !== 'all') {
                const agent = mockAgents.find((a) => a.name === conv.agentName);
                if (agent?.projectUuid !== conversationsSelectedProject)
                    return false;
            }

            // Filter by agent
            if (conversationsSelectedAgent !== 'all') {
                const agent = mockAgents.find(
                    (a) => a.uuid === conversationsSelectedAgent,
                );
                if (agent?.name !== conv.agentName) return false;
            }

            // Filter by status
            if (
                conversationsSelectedStatus !== 'all' &&
                conv.status !== conversationsSelectedStatus
            ) {
                return false;
            }

            // Filter by feedback
            if (conversationsSelectedFeedback !== 'all') {
                if (
                    conversationsSelectedFeedback === 'none' &&
                    conv.feedback !== null
                )
                    return false;
                if (
                    conversationsSelectedFeedback !== 'none' &&
                    conv.feedback !== conversationsSelectedFeedback
                )
                    return false;
            }

            // Filter by user
            if (conversationsSelectedUser !== 'all') {
                const userValue = conv.userName
                    .toLowerCase()
                    .replace(/\s+/g, '');
                if (userValue !== conversationsSelectedUser) return false;
            }

            // Filter by search query
            if (conversationsSearchQuery) {
                const searchTerms = conversationsSearchQuery
                    .toLowerCase()
                    .trim()
                    .split(/\s+/)
                    .filter((term) => term.length > 0);

                if (searchTerms.length === 0) return true;

                // Check if all search terms match at least one field
                return searchTerms.every(
                    (searchTerm) =>
                        conv.question.toLowerCase().includes(searchTerm) ||
                        conv.userName.toLowerCase().includes(searchTerm) ||
                        conv.agentName.toLowerCase().includes(searchTerm) ||
                        conv.projectName.toLowerCase().includes(searchTerm) ||
                        conv.status.toLowerCase().includes(searchTerm) ||
                        (conv.feedback &&
                            conv.feedback.toLowerCase().includes(searchTerm)) ||
                        conv.responseTime.toLowerCase().includes(searchTerm) ||
                        conv.timestamp.toLowerCase().includes(searchTerm),
                );
            }

            return true;
        })
        .sort((a, b) => {
            switch (conversationsSortBy) {
                case 'recent':
                    return (
                        new Date(b.timestamp).getTime() -
                        new Date(a.timestamp).getTime()
                    );
                case 'oldest':
                    return (
                        new Date(a.timestamp).getTime() -
                        new Date(b.timestamp).getTime()
                    );
                case 'responseTime':
                    const aTime =
                        a.responseTime === 'timeout'
                            ? 999
                            : parseFloat(a.responseTime);
                    const bTime =
                        b.responseTime === 'timeout'
                            ? 999
                            : parseFloat(b.responseTime);
                    return bTime - aTime;
                case 'user':
                    return a.userName.localeCompare(b.userName);
                case 'agent':
                    return a.agentName.localeCompare(b.agentName);
                default:
                    return 0;
            }
        });

    // Paginate conversations
    const totalPages = Math.ceil(
        filteredAllConversations.length / conversationsPerPage,
    );
    const paginatedConversations = filteredAllConversations.slice(
        (conversationsPage - 1) * conversationsPerPage,
        conversationsPage * conversationsPerPage,
    );

    const ConfigView = () => (
        <Stack gap="lg">
            <Flex justify="space-between" align="center">
                <div>
                    <Title order={3}>Configuration</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                        Manage agent settings and access controls
                    </Text>
                </div>
                <Group gap="sm">
                    <Button variant="light" size="sm">
                        Create Agent
                    </Button>
                </Group>
            </Flex>

            {/* Search and Filter Controls */}
            <Paper p="md" radius="md" withBorder>
                <Stack gap="md">
                    <Group justify="space-between" align="end">
                        <TextInput
                            placeholder="Search agents, projects, tags, or users..."
                            leftSection={<IconSearch size={16} />}
                            value={configSearchQuery}
                            onChange={(e) =>
                                setConfigSearchQuery(e.currentTarget.value)
                            }
                            w={350}
                            size="sm"
                        />
                        <Text size="sm" c="dimmed">
                            {filteredConfigAgents.length} of {mockAgents.length}{' '}
                            agents
                        </Text>
                    </Group>

                    <Group gap="md">
                        <Select
                            placeholder="All Projects"
                            data={[
                                { value: 'all', label: 'All Projects' },
                                ...projects.filter((p) => p.value !== 'all'),
                            ]}
                            value={configSelectedProject}
                            onChange={(value) =>
                                setConfigSelectedProject(value || 'all')
                            }
                            leftSection={<IconChevronDown size={14} />}
                            w={180}
                            size="sm"
                            clearable
                            onClear={() => setConfigSelectedProject('all')}
                        />

                        <Select
                            placeholder="All Status"
                            data={[
                                { value: 'all', label: 'All Status' },
                                { value: 'active', label: 'Active' },
                                { value: 'inactive', label: 'Inactive' },
                            ]}
                            value={configSelectedStatus}
                            onChange={(value) =>
                                setConfigSelectedStatus(value || 'all')
                            }
                            leftSection={<IconChevronDown size={14} />}
                            w={140}
                            size="sm"
                            clearable
                            onClear={() => setConfigSelectedStatus('all')}
                        />

                        <Select
                            placeholder="Sort by"
                            data={[
                                { value: 'name', label: 'Name A-Z' },
                                { value: 'project', label: 'Project A-Z' },
                                {
                                    value: 'conversations',
                                    label: 'Most Conversations',
                                },
                                {
                                    value: 'satisfaction',
                                    label: 'Highest Satisfaction',
                                },
                                {
                                    value: 'lastActive',
                                    label: 'Recently Active',
                                },
                            ]}
                            value={configSortBy}
                            onChange={(value) =>
                                setConfigSortBy(value || 'name')
                            }
                            leftSection={<IconChevronDown size={14} />}
                            w={180}
                            size="sm"
                        />

                        {/* Clear all filters button */}
                        {(configSearchQuery ||
                            configSelectedProject !== 'all' ||
                            configSelectedStatus !== 'all' ||
                            configSortBy !== 'name') && (
                            <Button
                                variant="subtle"
                                size="sm"
                                c="dimmed"
                                onClick={() => {
                                    setConfigSearchQuery('');
                                    setConfigSelectedProject('all');
                                    setConfigSelectedStatus('all');
                                    setConfigSortBy('name');
                                }}
                            >
                                Clear filters
                            </Button>
                        )}
                    </Group>
                </Stack>
            </Paper>

            <Paper p="lg" radius="md" withBorder>
                <ScrollArea>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Agent</Table.Th>
                                <Table.Th>Project</Table.Th>
                                <Table.Th>Tags</Table.Th>
                                <Table.Th>Access</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Performance</Table.Th>
                                <Table.Th></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {filteredConfigAgents.length > 0 ? (
                                filteredConfigAgents.map((agent) => (
                                    <Table.Tr key={agent.uuid}>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Avatar
                                                    size="sm"
                                                    radius="xl"
                                                    color="gray"
                                                >
                                                    <IconBrain size={16} />
                                                </Avatar>
                                                <div>
                                                    <Text size="sm" fw={500}>
                                                        {agent.name}
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        {agent.lastActive}
                                                    </Text>
                                                </div>
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {agent.projectName}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap={4}>
                                                {agent.tags
                                                    .slice(0, 2)
                                                    .map((tag) => (
                                                        <Text
                                                            key={tag}
                                                            size="xs"
                                                            c="dimmed"
                                                        >
                                                            {tag}
                                                        </Text>
                                                    ))}
                                                {agent.tags.length > 2 && (
                                                    <Text size="xs" c="dimmed">
                                                        +{agent.tags.length - 2}
                                                    </Text>
                                                )}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>
                                            <Stack gap={2}>
                                                <Text size="xs">
                                                    {agent.userAccess.length}{' '}
                                                    users
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {agent.groupAccess.length}{' '}
                                                    groups
                                                </Text>
                                            </Stack>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge
                                                variant="dot"
                                                color={
                                                    agent.status === 'active'
                                                        ? 'green'
                                                        : 'gray'
                                                }
                                                size="sm"
                                            >
                                                {agent.status}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Stack gap={2}>
                                                <Text size="xs">
                                                    {agent.conversations.toLocaleString()}{' '}
                                                    queries
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {agent.satisfaction}/5.0
                                                    rating
                                                </Text>
                                            </Stack>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <ActionIcon
                                                    variant="subtle"
                                                    size="sm"
                                                    color="gray"
                                                >
                                                    <IconEdit size={14} />
                                                </ActionIcon>
                                                <ActionIcon
                                                    variant="subtle"
                                                    size="sm"
                                                    color="gray"
                                                >
                                                    <IconSettings size={14} />
                                                </ActionIcon>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))
                            ) : (
                                <Table.Tr>
                                    <Table.Td colSpan={7} ta="center" py="xl">
                                        <Stack gap="sm" align="center">
                                            <IconSearch
                                                size={32}
                                                color="#999"
                                            />
                                            <Text size="sm" c="dimmed" fw={500}>
                                                No agents found
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {configSearchQuery &&
                                                configSelectedProject !== 'all'
                                                    ? `No agents match "${configSearchQuery}" in ${
                                                          projects.find(
                                                              (p) =>
                                                                  p.value ===
                                                                  configSelectedProject,
                                                          )?.label
                                                      }`
                                                    : configSearchQuery
                                                      ? `No agents match "${configSearchQuery}"`
                                                      : configSelectedProject !==
                                                          'all'
                                                        ? `No agents in ${
                                                              projects.find(
                                                                  (p) =>
                                                                      p.value ===
                                                                      configSelectedProject,
                                                              )?.label
                                                          }`
                                                        : 'Try adjusting your search or filters'}
                                            </Text>
                                        </Stack>
                                    </Table.Td>
                                </Table.Tr>
                            )}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
            </Paper>
        </Stack>
    );

    const AnalyticsView = () => {
        // Get analytics data based on current filters
        const analyticsData = generateAnalyticsData(
            granularity,
            selectedProject,
            selectedAgent,
        );

        // Generate date labels based on time range
        const getDateLabels = () => {
            if (timeRange === '7d') {
                return [
                    'Dec 26',
                    'Dec 27',
                    'Dec 28',
                    'Dec 29',
                    'Dec 30',
                    'Dec 31',
                    'Jan 1',
                ];
            } else if (timeRange === '30d') {
                return [
                    'Dec 3',
                    'Dec 8',
                    'Dec 13',
                    'Dec 18',
                    'Dec 23',
                    'Dec 28',
                    'Jan 1',
                ];
            } else {
                return ['Oct', 'Nov', 'Dec'];
            }
        };

        // Chart configurations with dynamic data
        const visitorChartOptions = {
            grid: { top: 30, right: 20, bottom: 60, left: 50 },
            xAxis: {
                type: 'category',
                data: getDateLabels(),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#999', fontSize: 11 },
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#f0f0f0' } },
                axisLabel: { color: '#999', fontSize: 11 },
            },
            series: [
                {
                    data: analyticsData.conversationTrend.slice(
                        0,
                        getDateLabels().length,
                    ),
                    type: 'line',
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: '#4263eb' },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(66, 99, 235, 0.15)' },
                                { offset: 1, color: 'rgba(66, 99, 235, 0)' },
                            ],
                        },
                    },
                },
            ],
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#fff',
                borderColor: '#e0e0e0',
                borderWidth: 1,
                textStyle: { color: '#333' },
                formatter: '{b}: {c} conversations',
            },
        };

        // Calculate trend percentages
        const conversationTrend =
            granularity === 'organization'
                ? -37.4
                : granularity === 'project' && selectedProject === 'proj-1'
                  ? 12.5
                  : granularity === 'agent' && selectedAgent === 'agent-2'
                    ? 8.3
                    : -15.2;
        const queryTrend =
            granularity === 'organization'
                ? -40.9
                : granularity === 'project' && selectedProject === 'proj-1'
                  ? 15.2
                  : granularity === 'agent' && selectedAgent === 'agent-2'
                    ? 10.1
                    : -18.5;
        const satisfactionTrend = analyticsData.satisfaction > 85 ? 3.2 : -2.1;

        return (
            <Stack gap="lg">
                <Flex justify="space-between" align="center">
                    <div>
                        <Title order={3}>Analytics</Title>
                        <Text size="sm" c="dimmed" mt={4}>
                            {granularity === 'organization' &&
                                'Organization-wide metrics'}
                            {granularity === 'project' &&
                                selectedProject === 'all' &&
                                'Select a project to view metrics'}
                            {granularity === 'project' &&
                                selectedProject !== 'all' &&
                                `Project: ${
                                    projects.find(
                                        (p) => p.value === selectedProject,
                                    )?.label
                                }`}
                            {granularity === 'agent' &&
                                selectedAgent === 'all' &&
                                'Select an agent to view metrics'}
                            {granularity === 'agent' &&
                                selectedAgent !== 'all' &&
                                `Agent: ${
                                    agents.find(
                                        (a) => a.value === selectedAgent,
                                    )?.label
                                }`}
                        </Text>
                    </div>
                    <Group gap="sm">
                        <Select
                            placeholder="Last 7 days"
                            data={[
                                { value: '7d', label: 'Last 7 days' },
                                { value: '30d', label: 'Last 30 days' },
                                { value: '90d', label: 'Last 90 days' },
                            ]}
                            value={timeRange}
                            onChange={(value) => setTimeRange(value || '7d')}
                            leftSection={<IconCalendar size={14} />}
                            w={150}
                        />
                        <SegmentedControl
                            value={granularity}
                            onChange={(value) => {
                                setGranularity(value);
                                // Reset selections when changing granularity
                                if (value === 'organization') {
                                    setSelectedProject('all');
                                    setSelectedAgent('all');
                                } else if (value === 'project') {
                                    setSelectedAgent('all');
                                }
                            }}
                            data={[
                                {
                                    label: 'Organization',
                                    value: 'organization',
                                },
                                { label: 'Project', value: 'project' },
                                { label: 'Agent', value: 'agent' },
                            ]}
                        />
                    </Group>
                </Flex>

                {/* Filter dropdowns when project or agent is selected */}
                {(granularity === 'project' || granularity === 'agent') && (
                    <Paper p="md" radius="md" withBorder>
                        <Group gap="md">
                            {granularity === 'project' && (
                                <Select
                                    label="Select Project"
                                    placeholder="Choose a project"
                                    data={projects.filter(
                                        (p) => p.value !== 'all',
                                    )}
                                    value={
                                        selectedProject === 'all'
                                            ? null
                                            : selectedProject
                                    }
                                    onChange={(value) =>
                                        setSelectedProject(value || 'all')
                                    }
                                    leftSection={<IconChevronDown size={14} />}
                                    w={250}
                                    clearable
                                    onClear={() => setSelectedProject('all')}
                                />
                            )}
                            {granularity === 'agent' && (
                                <>
                                    <Select
                                        label="Filter by Project (optional)"
                                        placeholder="All projects"
                                        data={projects.filter(
                                            (p) => p.value !== 'all',
                                        )}
                                        value={
                                            selectedProject === 'all'
                                                ? null
                                                : selectedProject
                                        }
                                        onChange={(value) => {
                                            setSelectedProject(value || 'all');
                                            // Reset agent selection if project changes
                                            setSelectedAgent('all');
                                        }}
                                        leftSection={
                                            <IconChevronDown size={14} />
                                        }
                                        w={250}
                                        clearable
                                        onClear={() =>
                                            setSelectedProject('all')
                                        }
                                    />
                                    <Select
                                        label="Select Agent"
                                        placeholder="Choose an agent"
                                        data={
                                            selectedProject === 'all'
                                                ? agents.filter(
                                                      (a) => a.value !== 'all',
                                                  )
                                                : agents.filter((a) => {
                                                      if (a.value === 'all')
                                                          return false;
                                                      const agent =
                                                          mockAgents.find(
                                                              (ma) =>
                                                                  ma.uuid ===
                                                                  a.value,
                                                          );
                                                      return (
                                                          agent?.projectUuid ===
                                                          selectedProject
                                                      );
                                                  })
                                        }
                                        value={
                                            selectedAgent === 'all'
                                                ? null
                                                : selectedAgent
                                        }
                                        onChange={(value) =>
                                            setSelectedAgent(value || 'all')
                                        }
                                        leftSection={
                                            <IconChevronDown size={14} />
                                        }
                                        w={250}
                                        clearable
                                        onClear={() => setSelectedAgent('all')}
                                    />
                                </>
                            )}
                        </Group>
                    </Paper>
                )}

                {/* Only show metrics if a selection is made or at organization level */}
                {granularity === 'organization' ||
                (granularity === 'project' && selectedProject !== 'all') ||
                (granularity === 'agent' && selectedAgent !== 'all') ? (
                    <>
                        <Grid>
                            <Grid.Col span={4}>
                                <Paper p="lg" radius="md" withBorder>
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        tt="uppercase"
                                        fw={600}
                                        mb="xs"
                                    >
                                        Conversations
                                    </Text>
                                    <Group align="end" gap="xs">
                                        <Text size="2xl" fw={600} lh={1}>
                                            {analyticsData.conversations.toLocaleString()}
                                        </Text>
                                        <Group gap={4} mb={4}>
                                            {conversationTrend < 0 ? (
                                                <>
                                                    <IconTrendingDown
                                                        size={16}
                                                        color="#fa5252"
                                                    />
                                                    <Text
                                                        size="sm"
                                                        c="red"
                                                        fw={500}
                                                    >
                                                        {conversationTrend}%
                                                    </Text>
                                                </>
                                            ) : (
                                                <>
                                                    <IconTrendingUp
                                                        size={16}
                                                        color="#51cf66"
                                                    />
                                                    <Text
                                                        size="sm"
                                                        c="green"
                                                        fw={500}
                                                    >
                                                        +{conversationTrend}%
                                                    </Text>
                                                </>
                                            )}
                                        </Group>
                                    </Group>
                                </Paper>
                            </Grid.Col>
                            <Grid.Col span={4}>
                                <Paper p="lg" radius="md" withBorder>
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        tt="uppercase"
                                        fw={600}
                                        mb="xs"
                                    >
                                        Total Queries
                                    </Text>
                                    <Group align="end" gap="xs">
                                        <Text size="2xl" fw={600} lh={1}>
                                            {analyticsData.queries.toLocaleString()}
                                        </Text>
                                        <Group gap={4} mb={4}>
                                            {queryTrend < 0 ? (
                                                <>
                                                    <IconTrendingDown
                                                        size={16}
                                                        color="#fa5252"
                                                    />
                                                    <Text
                                                        size="sm"
                                                        c="red"
                                                        fw={500}
                                                    >
                                                        {queryTrend}%
                                                    </Text>
                                                </>
                                            ) : (
                                                <>
                                                    <IconTrendingUp
                                                        size={16}
                                                        color="#51cf66"
                                                    />
                                                    <Text
                                                        size="sm"
                                                        c="green"
                                                        fw={500}
                                                    >
                                                        +{queryTrend}%
                                                    </Text>
                                                </>
                                            )}
                                        </Group>
                                    </Group>
                                </Paper>
                            </Grid.Col>

                            <Grid.Col span={4}>
                                <Paper p="lg" radius="md" withBorder>
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        tt="uppercase"
                                        fw={600}
                                        mb="xs"
                                    >
                                        Satisfaction
                                    </Text>
                                    <Group align="end" gap="xs">
                                        <Text size="2xl" fw={600} lh={1}>
                                            {analyticsData.satisfaction}%
                                        </Text>
                                        <Group gap={4} mb={4}>
                                            {satisfactionTrend > 0 ? (
                                                <>
                                                    <IconTrendingUp
                                                        size={16}
                                                        color="#51cf66"
                                                    />
                                                    <Text
                                                        size="sm"
                                                        c="green"
                                                        fw={500}
                                                    >
                                                        +{satisfactionTrend}%
                                                    </Text>
                                                </>
                                            ) : (
                                                <>
                                                    <IconTrendingDown
                                                        size={16}
                                                        color="#fa5252"
                                                    />
                                                    <Text
                                                        size="sm"
                                                        c="red"
                                                        fw={500}
                                                    >
                                                        {satisfactionTrend}%
                                                    </Text>
                                                </>
                                            )}
                                        </Group>
                                    </Group>
                                </Paper>
                            </Grid.Col>
                        </Grid>

                        <Grid>
                            <Grid.Col span={12}>
                                <Paper p="lg" radius="md" withBorder>
                                    <Text size="sm" fw={600} mb="md">
                                        Conversation History
                                    </Text>
                                    <ReactECharts
                                        option={visitorChartOptions}
                                        style={{ height: '240px' }}
                                    />
                                </Paper>
                            </Grid.Col>
                        </Grid>

                        <Paper p="lg" radius="md" withBorder>
                            <Flex
                                justify="space-between"
                                align="center"
                                mb="md"
                            >
                                <Text size="sm" fw={600}>
                                    Recent Conversations
                                </Text>
                                <TextInput
                                    placeholder="Search..."
                                    leftSection={<IconSearch size={14} />}
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.currentTarget.value)
                                    }
                                    w={250}
                                    size="xs"
                                />
                            </Flex>
                            <ScrollArea>
                                <Table>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>User</Table.Th>
                                            <Table.Th>Question</Table.Th>
                                            <Table.Th>Agent</Table.Th>
                                            <Table.Th>Feedback</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {filteredConversations
                                            .slice(0, 5)
                                            .map((conv) => (
                                                <Table.Tr
                                                    key={conv.uuid}
                                                    style={{
                                                        cursor: 'pointer',
                                                    }}
                                                    onClick={() => {
                                                        setSelectedConversation(
                                                            conv.uuid,
                                                        );
                                                        setSidebarOpen(true);
                                                    }}
                                                >
                                                    <Table.Td>
                                                        <Text size="sm">
                                                            {conv.userName}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text
                                                            size="sm"
                                                            lineClamp={1}
                                                            maw={300}
                                                        >
                                                            {conv.question}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text
                                                            size="sm"
                                                            c="dimmed"
                                                        >
                                                            {conv.agentName}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {conv.feedback ===
                                                            'positive' && (
                                                            <IconThumbUp
                                                                size={14}
                                                                color="#51cf66"
                                                            />
                                                        )}
                                                        {conv.feedback ===
                                                            'negative' && (
                                                            <IconThumbDown
                                                                size={14}
                                                                color="#fa5252"
                                                            />
                                                        )}
                                                        {!conv.feedback && (
                                                            <Text
                                                                size="xs"
                                                                c="dimmed"
                                                            >
                                                                -
                                                            </Text>
                                                        )}
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>
                        </Paper>

                        <Grid>
                            <Grid.Col span={4}>
                                <Paper p="lg" radius="md" withBorder>
                                    <Text size="sm" fw={600} mb="sm">
                                        Top Questions
                                    </Text>
                                    <Stack gap="xs">
                                        {[
                                            { q: 'Sales by region', count: 23 },
                                            {
                                                q: 'YoY growth comparison',
                                                count: 18,
                                            },
                                            { q: 'Campaign ROI', count: 15 },
                                        ].map((item, idx) => (
                                            <Group
                                                key={idx}
                                                justify="space-between"
                                            >
                                                <Text size="xs" c="dimmed">
                                                    {item.q}
                                                </Text>
                                                <Text size="xs" fw={500}>
                                                    {item.count}
                                                </Text>
                                            </Group>
                                        ))}
                                    </Stack>
                                </Paper>
                            </Grid.Col>
                            <Grid.Col span={4}>
                                <Paper p="lg" radius="md" withBorder>
                                    <Text size="sm" fw={600} mb="sm">
                                        Popular Agents
                                    </Text>
                                    <Stack gap="xs">
                                        {[
                                            {
                                                name: 'Sales Analytics',
                                                usage: '45%',
                                            },
                                            {
                                                name: 'Marketing Insights',
                                                usage: '28%',
                                            },
                                            {
                                                name: 'Customer Support',
                                                usage: '18%',
                                            },
                                        ].map((agent, idx) => (
                                            <Group
                                                key={idx}
                                                justify="space-between"
                                            >
                                                <Text size="xs" c="dimmed">
                                                    {agent.name}
                                                </Text>
                                                <Text size="xs" fw={500}>
                                                    {agent.usage}
                                                </Text>
                                            </Group>
                                        ))}
                                    </Stack>
                                </Paper>
                            </Grid.Col>
                            <Grid.Col span={4}>
                                <Paper p="lg" radius="md" withBorder>
                                    <Text size="sm" fw={600} mb="sm">
                                        Failed Queries
                                    </Text>
                                    <Stack gap="xs">
                                        {[
                                            { reason: 'Timeout', count: 8 },
                                            {
                                                reason: 'Data not found',
                                                count: 5,
                                            },
                                            {
                                                reason: 'Permission denied',
                                                count: 2,
                                            },
                                        ].map((item, idx) => (
                                            <Group
                                                key={idx}
                                                justify="space-between"
                                            >
                                                <Text size="xs" c="dimmed">
                                                    {item.reason}
                                                </Text>
                                                <Text
                                                    size="xs"
                                                    fw={500}
                                                    c="red"
                                                >
                                                    {item.count}
                                                </Text>
                                            </Group>
                                        ))}
                                    </Stack>
                                </Paper>
                            </Grid.Col>
                        </Grid>
                    </>
                ) : (
                    // Empty state when no selection is made
                    <Paper p="xl" radius="md" withBorder ta="center">
                        <IconChartBar
                            size={48}
                            color="#999"
                            style={{ margin: '0 auto 16px' }}
                        />
                        <Title order={4} c="dimmed" mb="xs">
                            Select a filter to view analytics
                        </Title>
                        <Text size="sm" c="dimmed" mb="lg">
                            {granularity === 'project' &&
                                'Choose a project from the dropdown above to see detailed metrics and insights.'}
                            {granularity === 'agent' &&
                                'Choose an agent from the dropdown above to see detailed metrics and insights.'}
                        </Text>
                        <Text size="xs" c="dimmed">
                            Available data includes conversation trends,
                            response times, satisfaction scores, and more.
                        </Text>
                    </Paper>
                )}
            </Stack>
        );
    };

    const AllConversationsView = () => (
        <Stack gap="lg">
            <Flex justify="space-between" align="center">
                <div>
                    <Title order={3}>All Conversations</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                        Complete conversation history with advanced filtering
                    </Text>
                </div>
            </Flex>

            {/* Advanced Filter Controls */}
            <Paper p="lg" radius="md" withBorder>
                <Stack gap="lg">
                    {/* Search Section */}
                    <Group justify="space-between" align="flex-start">
                        <Stack gap="xs" style={{ flex: 1 }}>
                            <TextInput
                                placeholder="Search conversations, questions, users, agents..."
                                description="Search across conversation content, usernames, and agent names"
                                leftSection={<IconSearch size={16} />}
                                rightSection={
                                    conversationsSearchQuery ? (
                                        <ActionIcon
                                            variant="subtle"
                                            c="gray"
                                            size="sm"
                                            onClick={() =>
                                                setConversationsSearchQuery('')
                                            }
                                        >
                                            <IconX size={14} />
                                        </ActionIcon>
                                    ) : null
                                }
                                value={conversationsSearchQuery}
                                onChange={(e) =>
                                    setConversationsSearchQuery(
                                        e.currentTarget.value,
                                    )
                                }
                                size="sm"
                                style={{ maxWidth: 450 }}
                            />
                        </Stack>
                        <Stack gap="xs" align="flex-end">
                            <Text size="sm" fw={500} c="dark">
                                {filteredAllConversations.length}
                            </Text>
                            <Text size="xs" c="dimmed">
                                of {allConversations.length} conversations
                            </Text>
                        </Stack>
                    </Group>

                    <Divider />

                    {/* Filters Section */}
                    <div>
                        <Group gap="xs" mb="sm">
                            <IconFilter
                                size={16}
                                color="var(--mantine-color-dimmed)"
                            />
                            <Text size="sm" fw={500} c="dark">
                                Filters
                            </Text>
                            <Badge
                                variant="light"
                                size="sm"
                                color={
                                    conversationsSearchQuery ||
                                    conversationsSelectedProject !== 'all' ||
                                    conversationsSelectedAgent !== 'all' ||
                                    conversationsSelectedStatus !== 'all' ||
                                    conversationsSelectedFeedback !== 'all' ||
                                    conversationsSelectedUser !== 'all'
                                        ? 'blue'
                                        : 'gray'
                                }
                            >
                                {[
                                    conversationsSearchQuery ? 1 : 0,
                                    conversationsSelectedProject !== 'all'
                                        ? 1
                                        : 0,
                                    conversationsSelectedAgent !== 'all'
                                        ? 1
                                        : 0,
                                    conversationsSelectedStatus !== 'all'
                                        ? 1
                                        : 0,
                                    conversationsSelectedFeedback !== 'all'
                                        ? 1
                                        : 0,
                                    conversationsSelectedUser !== 'all' ? 1 : 0,
                                ].reduce((sum, val) => sum + val, 0)}{' '}
                                active
                            </Badge>
                        </Group>

                        <SimpleGrid cols={3} spacing="md" verticalSpacing="sm">
                            <Select
                                label="Project"
                                placeholder="All Projects"
                                data={[
                                    { value: 'all', label: 'All Projects' },
                                    ...projects.filter(
                                        (p) => p.value !== 'all',
                                    ),
                                ]}
                                value={conversationsSelectedProject}
                                onChange={(value) =>
                                    setConversationsSelectedProject(
                                        value || 'all',
                                    )
                                }
                                size="sm"
                                clearable={
                                    conversationsSelectedProject !== 'all'
                                }
                                rightSection={
                                    conversationsSelectedProject !==
                                    'all' ? null : (
                                        <IconChevronDown size={14} />
                                    )
                                }
                            />

                            <Select
                                label="Agent"
                                placeholder="All Agents"
                                data={[
                                    { value: 'all', label: 'All Agents' },
                                    ...agents.filter((a) => a.value !== 'all'),
                                ]}
                                value={conversationsSelectedAgent}
                                onChange={(value) =>
                                    setConversationsSelectedAgent(
                                        value || 'all',
                                    )
                                }
                                size="sm"
                                clearable={conversationsSelectedAgent !== 'all'}
                                rightSection={
                                    conversationsSelectedAgent !==
                                    'all' ? null : (
                                        <IconChevronDown size={14} />
                                    )
                                }
                            />

                            <Select
                                label="User"
                                placeholder="All Users"
                                data={[
                                    { value: 'all', label: 'All Users' },
                                    ...uniqueUsers,
                                ]}
                                value={conversationsSelectedUser}
                                onChange={(value) =>
                                    setConversationsSelectedUser(value || 'all')
                                }
                                size="sm"
                                clearable={conversationsSelectedUser !== 'all'}
                                rightSection={
                                    conversationsSelectedUser !==
                                    'all' ? null : (
                                        <IconChevronDown size={14} />
                                    )
                                }
                            />

                            <Select
                                label="Status"
                                placeholder="Any Status"
                                data={[
                                    { value: 'all', label: 'Any Status' },
                                    { value: 'completed', label: 'Completed' },
                                    { value: 'failed', label: 'Failed' },
                                ]}
                                value={conversationsSelectedStatus}
                                onChange={(value) =>
                                    setConversationsSelectedStatus(
                                        value || 'all',
                                    )
                                }
                                size="sm"
                                clearable={
                                    conversationsSelectedStatus !== 'all'
                                }
                                rightSection={
                                    conversationsSelectedStatus !==
                                    'all' ? null : (
                                        <IconChevronDown size={14} />
                                    )
                                }
                            />

                            <Select
                                label="Feedback"
                                placeholder="Any Feedback"
                                data={[
                                    { value: 'all', label: 'Any Feedback' },
                                    { value: 'positive', label: 'Positive' },
                                    { value: 'negative', label: 'Negative' },
                                    { value: 'none', label: 'No Feedback' },
                                ]}
                                value={conversationsSelectedFeedback}
                                onChange={(value) =>
                                    setConversationsSelectedFeedback(
                                        value || 'all',
                                    )
                                }
                                size="sm"
                                clearable={
                                    conversationsSelectedFeedback !== 'all'
                                }
                                rightSection={
                                    conversationsSelectedFeedback !==
                                    'all' ? null : (
                                        <IconChevronDown size={14} />
                                    )
                                }
                            />

                            <Select
                                label="Sort by"
                                placeholder="Sort by"
                                data={[
                                    { value: 'recent', label: 'Most Recent' },
                                    { value: 'oldest', label: 'Oldest First' },
                                    {
                                        value: 'responseTime',
                                        label: 'Slowest Response',
                                    },
                                    { value: 'user', label: 'User A-Z' },
                                    { value: 'agent', label: 'Agent A-Z' },
                                ]}
                                value={conversationsSortBy}
                                onChange={(value) =>
                                    setConversationsSortBy(value || 'recent')
                                }
                                size="sm"
                                rightSection={<IconChevronDown size={14} />}
                            />
                        </SimpleGrid>

                        {/* Clear filters */}
                        {(conversationsSearchQuery ||
                            conversationsSelectedProject !== 'all' ||
                            conversationsSelectedAgent !== 'all' ||
                            conversationsSelectedStatus !== 'all' ||
                            conversationsSelectedFeedback !== 'all' ||
                            conversationsSelectedUser !== 'all') && (
                            <Group justify="center" mt="md">
                                <Button
                                    variant="light"
                                    size="sm"
                                    color="gray"
                                    leftSection={<IconX size={14} />}
                                    onClick={() => {
                                        setConversationsSearchQuery('');
                                        setConversationsSelectedProject('all');
                                        setConversationsSelectedAgent('all');
                                        setConversationsSelectedStatus('all');
                                        setConversationsSelectedFeedback('all');
                                        setConversationsSelectedUser('all');
                                        setConversationsPage(1);
                                    }}
                                >
                                    Clear all filters
                                </Button>
                            </Group>
                        )}
                    </div>
                </Stack>
            </Paper>

            {/* Conversations Table */}
            <Paper p="lg" radius="md" withBorder>
                <ScrollArea>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>User</Table.Th>
                                <Table.Th>Question</Table.Th>
                                <Table.Th>Agent</Table.Th>
                                <Table.Th>Project</Table.Th>
                                <Table.Th>Feedback</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {paginatedConversations.length > 0 ? (
                                paginatedConversations.map((conv) => (
                                    <Table.Tr
                                        key={conv.uuid}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => {
                                            setSelectedConversation(conv.uuid);
                                            setSidebarOpen(true);
                                        }}
                                    >
                                        <Table.Td>
                                            <Text size="sm" fw={500}>
                                                {conv.userName}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text
                                                size="sm"
                                                lineClamp={2}
                                                maw={300}
                                            >
                                                {conv.question}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {conv.agentName}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge size="sm" variant="light">
                                                {conv.projectName}
                                            </Badge>
                                        </Table.Td>

                                        <Table.Td>
                                            {conv.feedback === 'positive' && (
                                                <IconThumbUp
                                                    size={14}
                                                    color="#51cf66"
                                                />
                                            )}
                                            {conv.feedback === 'negative' && (
                                                <IconThumbDown
                                                    size={14}
                                                    color="#fa5252"
                                                />
                                            )}
                                            {!conv.feedback && (
                                                <Text size="xs" c="dimmed">
                                                    -
                                                </Text>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                ))
                            ) : (
                                <Table.Tr>
                                    <Table.Td colSpan={8} ta="center" py="xl">
                                        <Stack gap="sm" align="center">
                                            <IconSearch
                                                size={32}
                                                color="#999"
                                            />
                                            <Text size="sm" c="dimmed" fw={500}>
                                                {conversationsSearchQuery
                                                    ? `No results for "${conversationsSearchQuery}"`
                                                    : 'No conversations match your filters'}
                                            </Text>
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                ta="center"
                                                maw={200}
                                            >
                                                {conversationsSearchQuery
                                                    ? 'Try different search terms or adjust your filters'
                                                    : 'Try broadening your filter criteria or search for specific terms'}
                                            </Text>
                                            {(conversationsSearchQuery ||
                                                conversationsSelectedProject !==
                                                    'all' ||
                                                conversationsSelectedAgent !==
                                                    'all' ||
                                                conversationsSelectedStatus !==
                                                    'all' ||
                                                conversationsSelectedFeedback !==
                                                    'all' ||
                                                conversationsSelectedUser !==
                                                    'all') && (
                                                <Button
                                                    variant="subtle"
                                                    size="xs"
                                                    color="gray"
                                                    mt="xs"
                                                    onClick={() => {
                                                        setConversationsSearchQuery(
                                                            '',
                                                        );
                                                        setConversationsSelectedProject(
                                                            'all',
                                                        );
                                                        setConversationsSelectedAgent(
                                                            'all',
                                                        );
                                                        setConversationsSelectedStatus(
                                                            'all',
                                                        );
                                                        setConversationsSelectedFeedback(
                                                            'all',
                                                        );
                                                        setConversationsSelectedUser(
                                                            'all',
                                                        );
                                                        setConversationsPage(1);
                                                    }}
                                                >
                                                    Clear all filters
                                                </Button>
                                            )}
                                        </Stack>
                                    </Table.Td>
                                </Table.Tr>
                            )}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>

                {/* Pagination */}
                {totalPages > 1 && (
                    <Group justify="space-between" mt="md">
                        <Text size="sm" c="dimmed">
                            Showing{' '}
                            {(conversationsPage - 1) * conversationsPerPage + 1}{' '}
                            to{' '}
                            {Math.min(
                                conversationsPage * conversationsPerPage,
                                filteredAllConversations.length,
                            )}{' '}
                            of {filteredAllConversations.length} conversations
                        </Text>
                        <Group gap="xs">
                            <Button
                                variant="subtle"
                                size="sm"
                                onClick={() =>
                                    setConversationsPage(conversationsPage - 1)
                                }
                                disabled={conversationsPage === 1}
                            >
                                Previous
                            </Button>
                            {Array.from(
                                { length: Math.min(5, totalPages) },
                                (_, i) => {
                                    const page =
                                        i + Math.max(1, conversationsPage - 2);
                                    if (page > totalPages) return null;
                                    return (
                                        <Button
                                            key={page}
                                            variant={
                                                page === conversationsPage
                                                    ? 'filled'
                                                    : 'subtle'
                                            }
                                            size="sm"
                                            onClick={() =>
                                                setConversationsPage(page)
                                            }
                                        >
                                            {page}
                                        </Button>
                                    );
                                },
                            )}
                            <Button
                                variant="subtle"
                                size="sm"
                                onClick={() =>
                                    setConversationsPage(conversationsPage + 1)
                                }
                                disabled={conversationsPage === totalPages}
                            >
                                Next
                            </Button>
                        </Group>
                    </Group>
                )}
            </Paper>
        </Stack>
    );

    // Conversation Sidebar Component
    const ConversationSidebar = () => {
        if (!selectedConversation) return null;

        const conversationDetails =
            generateConversationDetails(selectedConversation);
        const conversationInfo = mockConversations.find(
            (c) => c.uuid === selectedConversation,
        );

        const renderChart = (config: any, type: string) => {
            if (type === 'bar') {
                const chartOptions = {
                    grid: { top: 40, right: 20, bottom: 60, left: 80 },
                    title: {
                        text: config.title,
                        textStyle: { fontSize: 14, fontWeight: 'normal' },
                    },
                    xAxis: {
                        type: 'category',
                        data: config.data.map((item: any) => item.region),
                        axisLabel: { fontSize: 11, color: '#666' },
                    },
                    yAxis: {
                        type: 'value',
                        axisLabel: {
                            fontSize: 11,
                            color: '#666',
                            formatter: (value: number) =>
                                `$${(value / 1000).toFixed(0)}k`,
                        },
                    },
                    series: [
                        {
                            data: config.data.map((item: any) => item.sales),
                            type: 'bar',
                            itemStyle: {
                                color: '#4263eb',
                                borderRadius: [4, 4, 0, 0],
                            },
                        },
                    ],
                    tooltip: {
                        trigger: 'axis',
                        formatter: (params: any) => {
                            const data = params[0];
                            return `${data.name}: $${(
                                data.value / 1000
                            ).toFixed(0)}k`;
                        },
                    },
                };
                return (
                    <ReactECharts
                        option={chartOptions}
                        style={{ height: '250px' }}
                    />
                );
            }

            if (type === 'line') {
                const chartOptions = {
                    grid: { top: 40, right: 20, bottom: 60, left: 80 },
                    title: {
                        text: config.title,
                        textStyle: { fontSize: 14, fontWeight: 'normal' },
                    },
                    xAxis: {
                        type: 'category',
                        data: config.data.map((item: any) => item.campaign),
                        axisLabel: { fontSize: 11, color: '#666', rotate: 45 },
                    },
                    yAxis: {
                        type: 'value',
                        axisLabel: {
                            fontSize: 11,
                            color: '#666',
                            formatter: '{value}x',
                        },
                    },
                    series: [
                        {
                            data: config.data.map((item: any) => item.roi),
                            type: 'line',
                            smooth: true,
                            itemStyle: { color: '#51cf66' },
                            lineStyle: { color: '#51cf66', width: 3 },
                            symbol: 'circle',
                            symbolSize: 8,
                        },
                    ],
                    tooltip: {
                        trigger: 'axis',
                        formatter: (params: any) => {
                            const data = params[0];
                            const item = config.data[data.dataIndex];
                            return `
                                <div style="font-size: 12px;">
                                    <strong>${data.name}</strong><br/>
                                    ROI: ${data.value}x<br/>
                                    Spend: $${(item.spend / 1000).toFixed(
                                        0,
                                    )}k<br/>
                                    Revenue: $${(item.revenue / 1000).toFixed(
                                        0,
                                    )}k
                                </div>
                            `;
                        },
                    },
                };
                return (
                    <ReactECharts
                        option={chartOptions}
                        style={{ height: '250px' }}
                    />
                );
            }

            return null;
        };

        const renderTable = (tableData: any) => (
            <Paper p="md" radius="md" withBorder>
                <Text size="sm" fw={600} mb="sm">
                    {tableData.title}
                </Text>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            {tableData.headers.map(
                                (header: string, idx: number) => (
                                    <Table.Th key={idx}>{header}</Table.Th>
                                ),
                            )}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {tableData.rows.map((row: string[], idx: number) => (
                            <Table.Tr key={idx}>
                                {row.map((cell: string, cellIdx: number) => (
                                    <Table.Td key={cellIdx}>
                                        <Text size="sm">{cell}</Text>
                                    </Table.Td>
                                ))}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>
        );

        return (
            <Drawer
                opened={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                title={
                    <div>
                        <Text size="lg" fw={600}>
                            Conversation Details
                        </Text>
                        <Text size="sm" c="dimmed">
                            {conversationInfo?.userName} •{' '}
                            {conversationInfo?.agentName}
                        </Text>
                    </div>
                }
                position="right"
                size="600px"
                overlayProps={{ opacity: 0.3 }}
            >
                <Stack gap="md">
                    {/* Conversation metadata */}
                    <Paper p="md" radius="md" withBorder bg="gray.0">
                        <Group justify="space-between" mb="xs">
                            <Badge size="sm" variant="light">
                                {conversationInfo?.projectName}
                            </Badge>
                            <Group gap="xs">
                                <Text size="xs" c="dimmed">
                                    {conversationInfo?.timestamp}
                                </Text>
                                {conversationInfo?.feedback === 'positive' && (
                                    <IconThumbUp size={14} color="#51cf66" />
                                )}
                                {conversationInfo?.feedback === 'negative' && (
                                    <IconThumbDown size={14} color="#fa5252" />
                                )}
                            </Group>
                        </Group>
                        <Text size="xs" c="dimmed">
                            Response time: {conversationInfo?.responseTime}
                        </Text>
                    </Paper>

                    {/* Messages */}
                    <Stack gap="sm">
                        {conversationDetails.messages.map((message: any) => (
                            <div key={message.id}>
                                {message.type === 'user' ? (
                                    <Paper
                                        p="md"
                                        radius="md"
                                        bg="blue.0"
                                        ml="xl"
                                    >
                                        <Group justify="space-between" mb="xs">
                                            <Text size="sm" fw={500}>
                                                {message.user}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {message.timestamp}
                                            </Text>
                                        </Group>
                                        <Text size="sm">{message.content}</Text>
                                    </Paper>
                                ) : (
                                    <Paper
                                        p="md"
                                        radius="md"
                                        withBorder
                                        mr="xl"
                                    >
                                        <Group justify="space-between" mb="xs">
                                            <Group gap="xs">
                                                <Avatar
                                                    size="sm"
                                                    radius="xl"
                                                    color="blue"
                                                >
                                                    <IconBrain size={14} />
                                                </Avatar>
                                                <Text size="sm" fw={500}>
                                                    {
                                                        conversationInfo?.agentName
                                                    }
                                                </Text>
                                            </Group>
                                            <Text size="xs" c="dimmed">
                                                {message.timestamp}
                                            </Text>
                                        </Group>

                                        {message.isError ? (
                                            <Stack gap="sm">
                                                <Paper
                                                    p="sm"
                                                    radius="sm"
                                                    bg="red.0"
                                                >
                                                    <Text
                                                        size="sm"
                                                        c="red"
                                                        fw={500}
                                                        mb="xs"
                                                    >
                                                        ❌{' '}
                                                        {
                                                            message.errorDetails
                                                                .type
                                                        }
                                                    </Text>
                                                    <Text size="sm" c="red.7">
                                                        {
                                                            message.errorDetails
                                                                .message
                                                        }
                                                    </Text>
                                                </Paper>
                                                <Text size="sm">
                                                    {message.content}
                                                </Text>
                                                <Paper
                                                    p="sm"
                                                    radius="sm"
                                                    bg="yellow.0"
                                                >
                                                    <Text
                                                        size="sm"
                                                        fw={500}
                                                        mb="xs"
                                                    >
                                                        Suggestions:
                                                    </Text>
                                                    <Stack gap={4}>
                                                        {message.errorDetails.suggestions.map(
                                                            (
                                                                suggestion: string,
                                                                idx: number,
                                                            ) => (
                                                                <Text
                                                                    key={idx}
                                                                    size="xs"
                                                                    c="dimmed"
                                                                >
                                                                    •{' '}
                                                                    {suggestion}
                                                                </Text>
                                                            ),
                                                        )}
                                                    </Stack>
                                                </Paper>
                                            </Stack>
                                        ) : (
                                            <Stack gap="sm">
                                                <Text size="sm">
                                                    {message.content}
                                                </Text>

                                                {message.hasChart && (
                                                    <Paper
                                                        p="md"
                                                        radius="md"
                                                        withBorder
                                                        bg="gray.0"
                                                    >
                                                        {renderChart(
                                                            message.chartConfig,
                                                            message.chartType,
                                                        )}
                                                    </Paper>
                                                )}

                                                {message.hasTable &&
                                                    renderTable(
                                                        message.tableData,
                                                    )}
                                            </Stack>
                                        )}
                                    </Paper>
                                )}
                            </div>
                        ))}
                    </Stack>

                    {/* Actions */}
                    <Paper p="md" radius="md" withBorder>
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Conversation Actions
                            </Text>
                            <Group gap="xs">
                                <Tooltip label="View in full conversation">
                                    <ActionIcon variant="subtle" size="sm">
                                        <IconExternalLink size={14} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Share conversation">
                                    <ActionIcon variant="subtle" size="sm">
                                        <IconSearch size={14} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    </Paper>
                </Stack>
            </Drawer>
        );
    };

    return (
        <Box p="xl" bg="gray.0" mih="100vh">
            <Box maw={1400} mx="auto">
                <Flex justify="space-between" align="center" mb="xl">
                    <div>
                        <Title order={2} fw={600}>
                            AI Agents
                        </Title>
                        <Text c="dimmed" size="sm" mt={4}>
                            Monitor and configure AI agents across your
                            organization
                        </Text>
                    </div>
                </Flex>

                <Tabs
                    value={activeTab}
                    onChange={(value) => setActiveTab(value || '')}
                    variant="default"
                >
                    <Tabs.List mb="xl">
                        <Tabs.Tab value="analytics">Analytics</Tabs.Tab>
                        <Tabs.Tab value="conversations">
                            All Conversations
                        </Tabs.Tab>
                        <Tabs.Tab value="config">Configuration</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="analytics">
                        <AnalyticsView />
                    </Tabs.Panel>

                    <Tabs.Panel value="conversations">
                        <AllConversationsView />
                    </Tabs.Panel>

                    <Tabs.Panel value="config">
                        <ConfigView />
                    </Tabs.Panel>
                </Tabs>
            </Box>

            <ConversationSidebar />
        </Box>
    );
};
