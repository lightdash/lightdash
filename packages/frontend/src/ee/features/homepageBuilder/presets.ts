import {
    type HomepageBlock,
    type HomepageConfig,
    type HomepageRow,
} from '@lightdash/common';
import {
    IconBriefcase,
    IconChartHistogram,
    IconFile,
    IconLayoutDashboard,
    IconUsersGroup,
    IconUserStar,
    type Icon,
} from '@tabler/icons-react';
import { v4 as uuidv4 } from 'uuid';

export type HomepagePreset = {
    key: string;
    name: string;
    description: string;
    icon: Icon;
    blockChips: string[];
    create: () => HomepageConfig;
};

const row = (...blocks: HomepageBlock[]): HomepageRow => ({
    id: uuidv4(),
    blocks,
});

const hero = (title: string, subtitle: string): HomepageBlock => ({
    id: uuidv4(),
    type: 'hero',
    config: { title, subtitle },
});

const ai = (chips: string[]): HomepageBlock => ({
    id: uuidv4(),
    type: 'ai',
    config: { chips },
});

const collection = (title: string): HomepageBlock => ({
    id: uuidv4(),
    type: 'collection',
    config: { title, items: [] },
});

const markdown = (content: string): HomepageBlock => ({
    id: uuidv4(),
    type: 'markdown',
    config: { content },
});

const resources = (title: string): HomepageBlock => ({
    id: uuidv4(),
    type: 'resources',
    config: { title, items: [] },
});

const announcements = (title: string): HomepageBlock => ({
    id: uuidv4(),
    type: 'announcements',
    config: { title, items: [] },
});

const config = (...rows: HomepageRow[]): HomepageConfig => ({
    version: 1,
    rows,
});

export const homepagePresets: HomepagePreset[] = [
    {
        key: 'exec-overview',
        name: 'Exec overview',
        description: 'Company KPIs and the board pack, front and center.',
        icon: IconBriefcase,
        blockChips: ['Greeting', 'Collection', 'Ask AI'],
        create: () =>
            config(
                row(
                    hero(
                        'Good morning, {name}',
                        'Company performance at a glance.',
                    ),
                ),
                row(collection('Company KPIs')),
                row(ai(['Summarize this month vs. plan'])),
            ),
    },
    {
        key: 'team-hub',
        name: 'Team hub',
        description: 'A landing page for one team: dashboards, links, news.',
        icon: IconUsersGroup,
        blockChips: [
            'Greeting',
            'Ask AI',
            'Collection',
            'Resources',
            'Announcements',
        ],
        create: () =>
            config(
                row(
                    hero(
                        'Good morning, {name}',
                        'Your team’s snapshot — ask anything, or jump back in.',
                    ),
                ),
                row(ai(['What drove revenue last month?'])),
                row(collection('Team dashboards')),
                row(
                    resources('Getting started'),
                    announcements('From the data team'),
                ),
            ),
    },
    {
        key: 'business-user-starter',
        name: 'Business-user starter',
        description: 'Curated essentials for people who just need answers.',
        icon: IconUserStar,
        blockChips: ['Greeting', 'Collection', 'Resources'],
        create: () =>
            config(
                row(
                    hero(
                        'Welcome, {name}',
                        'Everything you need, curated by the data team.',
                    ),
                ),
                row(collection('Your dashboards')),
                row(resources('How-to guides')),
            ),
    },
    {
        key: 'analyst-workspace',
        name: 'Analyst workspace',
        description: 'Power-user shortcuts and a scratchpad.',
        icon: IconChartHistogram,
        blockChips: ['Greeting', 'Ask AI', 'Text'],
        create: () =>
            config(
                row(
                    hero(
                        'Welcome back, {name}',
                        'Here’s what’s been happening.',
                    ),
                ),
                row(ai(['Charts nobody has viewed in 90 days'])),
                row(
                    markdown('## Notes\n\nKeep links, TODOs and context here.'),
                ),
            ),
    },
    {
        key: 'dashboard-as-homepage',
        name: 'Dashboard as homepage',
        description: 'One key dashboard is the whole page.',
        icon: IconLayoutDashboard,
        blockChips: ['Collection'],
        create: () => config(row(collection('Your dashboard'))),
    },
    {
        key: 'blank',
        name: 'Blank',
        description: 'Start from nothing.',
        icon: IconFile,
        blockChips: [],
        create: () => config(),
    },
];
