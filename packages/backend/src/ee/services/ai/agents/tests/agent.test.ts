import { CoreMessage } from 'ai';
import fetchMock from 'jest-fetch-mock';
import { generateAgentResponse } from '../agent';
import {
    createArgs as createArgsFactory,
    createMessage,
    createMockDepsFactory,
    createToolMessages,
    mockExploresSummary,
    promptTestUtils,
} from './testUtils';

if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run these test');
}

const TIMEOUT = 30_000;
const createArgs = createArgsFactory({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4.1',
});

describe('generateAgentResponse', () => {
    beforeEach(() => {
        fetchMock.disableMocks();
        jest.clearAllMocks();
    });

    describe('Basic functionality', () => {
        it(
            'correctly returns all the models it can use',
            async () => {
                const message = createMessage('What models can you use?');
                const args = createArgs({
                    messageHistory: [message],
                });
                const { dependencies, internal } = createMockDepsFactory();

                const text = await generateAgentResponse({
                    args,
                    dependencies,
                });

                promptTestUtils.expectCorrectToolCalls(
                    internal.getToolCallsAndResults(),
                    ['findExplores'],
                );
                mockExploresSummary
                    .map((explore) => explore.label.toLowerCase())
                    .forEach((model) =>
                        promptTestUtils.expectResponseWithContent(text, model),
                    );
            },
            TIMEOUT,
        );

        it(
            'should demonstrate custom instruction influence',
            async () => {
                const message = createMessage('What can you do?');

                // no instruction
                const baseArgs = createArgs({ messageHistory: [message] });
                const { dependencies } = createMockDepsFactory();
                const baseResponse = await generateAgentResponse({
                    args: baseArgs,
                    dependencies,
                });

                // make it mention visualization
                const customArgs = createArgs({
                    messageHistory: [message],
                    agentSettings: {
                        instruction:
                            'Always mention data visualization in your responses',
                    },
                });
                const customResponse = await generateAgentResponse({
                    args: customArgs,
                    dependencies,
                });

                expect(customResponse).not.toBe(baseResponse);
                promptTestUtils.expectResponseWithContent(
                    customResponse,
                    'visualization',
                );
            },
            TIMEOUT,
        );
    });

    describe('Multi-prompt conversation testing', () => {
        it(
            'should maintain context across multiple prompts in a conversation',
            async () => {
                const { dependencies, internal } = createMockDepsFactory();
                /**
                 * First prompt:
                 * What data do we have about customers?
                 * Expects:
                 * - Use correct tools to find data
                 */
                const messageHistory: CoreMessage[] = [
                    {
                        role: 'user',
                        content: 'What data do we have about customers?',
                    },
                ];

                const firstResponse = await generateAgentResponse({
                    args: createArgs({ messageHistory }),
                    dependencies,
                });

                promptTestUtils.expectCorrectToolCalls(
                    internal.getToolCallsAndResults(),
                    ['findExplores', 'findFields'],
                );
                promptTestUtils.expectResponseWithContent(firstResponse, [
                    'customer id',
                    'customer name',
                    'customer email',
                    'total revenue',
                    'order count',
                ]);
                messageHistory.push(
                    ...createToolMessages(internal.getToolCallsAndResults()),
                );
                internal.cleanAllToolCallsAndResults();

                /**
                 * Second prompt:
                 * What are the top customers by revenue?
                 * Expects:
                 * - Reusing history
                 * - Reusing tool calls and results from first prompt
                 */
                messageHistory.push(
                    createMessage(
                        'Can you show me a table with the top customers by revenue?',
                    ),
                );
                const secondResponse = await generateAgentResponse({
                    args: createArgs({ messageHistory }),
                    dependencies,
                });
                promptTestUtils.expectCorrectToolCalls(
                    internal.getToolCallsAndResults(),
                    ['generateTableVizConfig'],
                );
                promptTestUtils.expectResponseWithContent(secondResponse, [
                    'table',
                    'top customers',
                    'revenue',
                ]);
                messageHistory.push(
                    ...createToolMessages(internal.getToolCallsAndResults()),
                );
                internal.cleanAllToolCallsAndResults();

                /**
                 * Third prompt:
                 * Give me that viz!
                 * Expects:
                 * - Reusing history
                 * - Reusing tool calls and results from previous prompts
                 * - Use correct tool for bar chart
                 */
                messageHistory.push(
                    createMessage('Can you create a bar chart of this data?'),
                );
                const thirdResponse = await generateAgentResponse({
                    args: createArgs({ messageHistory }),
                    dependencies,
                });
                promptTestUtils.expectCorrectToolCalls(
                    internal.getToolCallsAndResults(),
                    ['generateBarVizConfig'],
                );
                internal.cleanAllToolCallsAndResults();
                promptTestUtils.expectResponseWithContent(
                    thirdResponse,
                    'bar chart',
                );
            },
            TIMEOUT * 3,
        );
    });
});
