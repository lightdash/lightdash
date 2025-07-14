import fetchMock from 'jest-fetch-mock';
import { generateAgentResponse } from '../agent';
import {
    createArgs,
    createMessage,
    createMockDeps,
    mockExploresSummary,
    promptTestUtils,
    type ConversationHistory,
} from './testUtils';

const { OPENAI_API_KEY } = process.env;
const TIMEOUT = 30_000;

const runTests = () => {
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
                        agentSettings: {
                            instruction: `When asked about models you can use, only respond with a list of the models you can see`,
                        },
                    });
                    const deps = createMockDeps(message.content);

                    const text = await generateAgentResponse({
                        args,
                        dependencies: deps,
                    });

                    promptTestUtils.expectCorrectToolUsage(deps, [
                        'getExplores',
                    ]);
                    mockExploresSummary
                        .map((explore) => explore.label.toLowerCase())
                        .forEach((model) =>
                            promptTestUtils.expectResponseWithContent(
                                text,
                                model,
                            ),
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
                    const baseDeps = createMockDeps(message.content);
                    const baseResponse = await generateAgentResponse({
                        args: baseArgs,
                        dependencies: baseDeps,
                    });

                    // make it mention visualization
                    const customArgs = createArgs({
                        messageHistory: [message],
                        agentSettings: {
                            instruction:
                                'Always mention data visualization in your responses',
                        },
                    });
                    const customDeps = createMockDeps(message.content);
                    const customResponse = await generateAgentResponse({
                        args: customArgs,
                        dependencies: customDeps,
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
                    const deps = createMockDeps('conversation test');

                    // 1. what data from customers?
                    const firstMessage = createMessage(
                        'What data do we have about customers?',
                    );
                    const firstArgs = createArgs({
                        messageHistory: [firstMessage],
                    });

                    const firstResponse = await generateAgentResponse({
                        args: firstArgs,
                        dependencies: deps,
                    });

                    promptTestUtils.expectCorrectToolUsage(deps, [
                        'getExplores',
                        'getExplore',
                        'searchFields',
                    ]);
                    promptTestUtils.expectResponseWithContent(firstResponse, [
                        'customer id',
                        'customer name',
                        'customer email',
                        'total revenue',
                        'order count',
                    ]);

                    // 2. what are the top customers by revenue?
                    const secondMessage = createMessage(
                        'Can you show me the top customers by revenue?',
                    );
                    const conversationHistory = [
                        firstMessage,
                        createMessage(firstResponse, 'assistant'),
                        secondMessage,
                    ] satisfies ConversationHistory;
                    const secondArgs = createArgs({
                        messageHistory: conversationHistory,
                    });

                    const secondResponse = await generateAgentResponse({
                        args: secondArgs,
                        dependencies: deps,
                    });

                    promptTestUtils.expectResponseWithContent(secondResponse, [
                        'chart',
                        'top customers',
                        'revenue',
                    ]);
                    promptTestUtils.expectCorrectToolUsage(deps, [
                        'getExplores',
                        'getExplore',
                        'searchFields',
                        'getPrompt',
                    ]);

                    // 3. give me that viz!
                    const thirdMessage = createMessage(
                        'Can you create a bar chart of this data?',
                    );
                    const fullConversation = [
                        ...conversationHistory,
                        createMessage(secondResponse, 'assistant'),
                        thirdMessage,
                    ] satisfies ConversationHistory;
                    const thirdArgs = createArgs({
                        messageHistory: fullConversation,
                    });

                    const thirdResponse = await generateAgentResponse({
                        args: thirdArgs,
                        dependencies: deps,
                    });

                    promptTestUtils.expectCorrectToolUsage(deps, [
                        'getExplores',
                        'getExplore',
                        'searchFields',
                        'getPrompt',
                    ]);
                    promptTestUtils.expectResponseWithContent(
                        thirdResponse,
                        'bar chart',
                    );
                },
                TIMEOUT * 3,
            );
        });
    });
};

if (!OPENAI_API_KEY) {
    describe('skipping AI agent integration tests - OPENAI_API_KEY is not set', () => {
        it('skips', () => {
            expect(true).toBe(true);
        });
    });
} else {
    runTests();
}
