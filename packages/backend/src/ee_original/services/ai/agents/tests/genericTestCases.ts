import { AiAgent } from '@lightdash/common';
import {
    getServices,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';

export const genericTestCases: TestCase[] = [
    {
        prompt: "What's our average cost?",
        expectedAnswer: 'asks for clarification',
        expectedToolOutcome:
            'It should have used the findExplores tool to ask for clarification on which cost metric and explore',
    },
    {
        prompt: "What's our average building cost?",
        expectedAnswer:
            'Returns Average operating cost per building - a value and asks if it should be broken down by a dimension',
    },
    {
        prompt: "What's our revenue?",
        expectedAnswer: 'Asks for clarification',
        expectedToolOutcome:
            'It should have used the findExplores tool to ask for clarification on which revenue metric and explore',
    },
    {
        prompt: "What's our marketing revenue?",
        expectedAnswer:
            'Picks marketing explore or asks for clarification based on the marketing touchpoints explore or the campaigns explore',
    },
    {
        prompt: "What's our total count?",
        expectedAnswer: 'Should ask for clarification',
        expectedToolOutcome:
            'It should have used the findExplores tool to ask for clarification on which count metric and explore',
    },
    {
        prompt: 'Show me average ratings over time',
        expectedAnswer: 'Should ask for clarification',
        expectedToolOutcome:
            'It should have used the findExplores tool to ask for clarification on which ratings metric and explore',
    },
    {
        prompt: "What's our monthly revenue?",
        expectedAnswer: 'There are many to choose from',
        expectedToolOutcome: [
            `It should have identified multiple explores with revenue metrics`,
            `It may ask for clarification or pick the most relevant one`,
        ].join('\n'),
    },
    {
        prompt: 'Show me building occupancy rates by region',
        expectedAnswer:
            'should return  Northeast: 92.4%  and mentions that no other regions are available',
        expectedToolOutcome: [
            `It should have recognised there is ambiguity `,
            `It should have searched for occupancy_rate dimension/metric`,
            `It should have used fm_buildings_avg_occupancy metric`,
        ].join('\n'),
    },
    {
        prompt: 'What are our technician average utilization rates?',
        expectedAnswer: 'provides a value utilization rate for technicians',
        expectedToolOutcome: [
            `It should have picked the fm_technicians explore`,
            `It should have used average utilization metric`,
        ].join('\n'),
    },
    {
        prompt: "what's our monthly churn rate?",
        expectedAnswer:
            'will pick subscriptions explore because of its ai_hints but will say that it cannot find the churn rate metric',
    },
    {
        prompt: 'show me workforce productivity metrics',
        expectedAnswer:
            'will pick fm_technicians explore because of its ai_hints',
        expectedToolOutcome: [
            `It should have picked the fm_technicians explore`,
            `It should have used ai_hints to identify this explore`,
            `It should have used productivity-related metrics (utilization_rate, completion_rate, etc.)`,
        ].join('\n'),
    },
    {
        prompt: "What's our average building work order cost?",
        expectedAnswer:
            'should pick straight away the explore and run a query and return a value',
        expectedToolOutcome: [
            `It should have picked the fm_buildings explore immediately`,
        ].join('\n'),
    },
];

type Context = {
    services: ReturnType<typeof getServices>;
    agent: AiAgent;
    testContext: IntegrationTestContext;
};

export type TestCase = {
    prompt: string;
    expectedAnswer: string | ((context: Context) => Promise<string>);
    name?: string;
    expectedToolOutcome?: string;
    expectedArgsValidation?: Array<{
        toolName: string;
        expectedArgs: Record<string, unknown>;
    }>;
    contextRelevancy?: {
        context: string[] | ((context: Context) => Promise<string[]>);
        threshold?: number;
    };
};
