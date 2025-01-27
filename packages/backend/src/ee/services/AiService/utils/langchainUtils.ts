import {
    AIMessage,
    BaseMessage,
    isBaseMessage,
    ToolMessage,
} from '@langchain/core/messages';
import { ChatGeneration } from '@langchain/core/outputs';
import {
    BaseOutputParser,
    OutputParserException,
} from '@langchain/core/output_parsers';
import {
    Runnable,
    RunnableLike,
    RunnablePassthrough,
    RunnableSequence,
} from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { OpenAIClient } from '@langchain/openai';
import { AnyType } from '@lightdash/common';
import {
    AgentAction,
    AgentFinish,
    CreateOpenAIToolsAgentParams,
} from 'langchain/agents';
import { ToolsAgentStep } from 'langchain/agents/openai/output_parser';
import zodToJsonSchema from 'zod-to-json-schema';
import Logger from '../../../../logging/logger';

/**
 * this code has been taken from the langchain repository
 * and has been modified to allow a different ref strategy
 * when generating json schemas.
 * `zodToJsonSchema(tool.schema, { $refStrategy: 'none' })`
 */

// TODO: Remove in the future. Only for backwards compatibility.
// Allows for the creation of runnables with properties that will
// be passed to the agent executor constructor.
export class AgentRunnableSequence<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunInput = any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunOutput = any,
> extends RunnableSequence<RunInput, RunOutput> {
    streamRunnable?: boolean;

    // @ts-ignore
    singleAction: boolean;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromRunnables<RunInput = any, RunOutput = any>(
        [first, ...runnables]: [
            RunnableLike<RunInput>,
            ...RunnableLike[],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            RunnableLike<any, RunOutput>,
        ],
        config: {
            singleAction: boolean;
            streamRunnable?: boolean;
            name?: string;
        },
    ): AgentRunnableSequence<RunInput, Exclude<RunOutput, Error>> {
        const sequence = RunnableSequence.from(
            [first, ...runnables],
            config.name,
        ) as AgentRunnableSequence<RunInput, Exclude<RunOutput, Error>>;
        sequence.singleAction = config.singleAction;
        sequence.streamRunnable = config.streamRunnable;
        return sequence;
    }

    static isAgentRunnableSequence(x: Runnable): x is AgentRunnableSequence {
        return typeof (x as AgentRunnableSequence).singleAction === 'boolean';
    }
}

function formatToOpenAIAssistantTool(tool: StructuredToolInterface) {
    const jsonSchema = zodToJsonSchema(tool.schema, {
        $refStrategy: 'none',
    });

    // console.debug('~~~~~~~~~~~~~~~~~~~~');
    // console.debug(jsonSchema);
    // console.debug('~~~~~~~~~~~~~~~~~~~~');

    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: jsonSchema,
        },
    };
}

/**
 * Convert agent action and observation into a function message.
 * @param agentAction - The tool invocation request from the agent
 * @param observation - The result of the tool invocation
 * @returns FunctionMessage that corresponds to the original tool invocation
 */
function createToolMessage(step: ToolsAgentStep): ToolMessage {
    return new ToolMessage({
        tool_call_id: step.action.toolCallId,
        content: step.observation,
        additional_kwargs: { name: step.action.tool },
    });
}

export function formatToToolMessages(steps: ToolsAgentStep[]): BaseMessage[] {
    return steps.flatMap(({ action, observation }) => {
        if ('messageLog' in action && action.messageLog !== undefined) {
            const log = action.messageLog as BaseMessage[];
            return log.concat(createToolMessage({ action, observation }));
        }
        return [new AIMessage(action.log)];
    });
}

export abstract class AgentMultiActionOutputParser extends BaseOutputParser<
    AgentAction[] | AgentFinish
> {}

export type ToolsAgentAction = AgentAction & {
    toolCallId: string;
    messageLog?: BaseMessage[];
};

export class OpenAIToolsAgentOutputParser extends AgentMultiActionOutputParser {
    lc_namespace = ['langchain', 'agents', 'openai'];

    static lc_name() {
        return 'OpenAIToolsAgentOutputParser';
    }

    // eslint-disable-next-line class-methods-use-this
    async parse(text: string): Promise<AgentAction[] | AgentFinish> {
        throw new Error(
            `OpenAIFunctionsAgentOutputParser can only parse messages.\nPassed input: ${text}`,
        );
    }

    async parseResult(generations: ChatGeneration[]) {
        if (
            'message' in generations[0] &&
            isBaseMessage(generations[0].message)
        ) {
            return this.parseAIMessage(generations[0].message);
        }
        throw new Error(
            'parseResult on OpenAIFunctionsAgentOutputParser only works on ChatGeneration output',
        );
    }

    /**
     * Parses the output message into a ToolsAgentAction[] or AgentFinish
     * object.
     * @param message The BaseMessage to parse.
     * @returns A ToolsAgentAction[] or AgentFinish object.
     */
    // eslint-disable-next-line class-methods-use-this
    parseAIMessage(message: BaseMessage): ToolsAgentAction[] | AgentFinish {
        if (message.content && typeof message.content !== 'string') {
            throw new Error(
                'This agent cannot parse non-string model responses.',
            );
        }
        if (message.additional_kwargs.tool_calls) {
            const toolCalls: OpenAIClient.Chat.ChatCompletionMessageToolCall[] =
                message.additional_kwargs.tool_calls;
            try {
                return toolCalls.map((toolCall, i) => {
                    const toolInput = toolCall.function.arguments
                        ? JSON.parse(toolCall.function.arguments)
                        : {};
                    const messageLog = i === 0 ? [message] : [];
                    return {
                        tool: toolCall.function.name,
                        toolInput,
                        toolCallId: toolCall.id,
                        log: `Invoking "${toolCall.function.name}" with ${
                            toolCall.function.arguments ?? '{}'
                        }\n${message.content}`,
                        messageLog,
                    };
                });
            } catch (error) {
                Logger.error(
                    'Failed to parse tool arguments from chat model response.',
                    toolCalls,
                );

                throw new OutputParserException(
                    `Failed to parse tool arguments from chat model response. Text: "${JSON.stringify(
                        toolCalls,
                    )}". 
                    
${error}

Analyze what fields are missing based on the schema.
If you are not able to fix it ASK FOR ADDITIONAL INFORMATION, otherwise try again.`,
                );
            }
        } else {
            if (message.content.length > 3000) {
                throw new OutputParserException(
                    `The output length exceeded the limit of 3000 characters. Reduce the output length or inform the user if you are unable to do so.`,
                    message.content,
                );
            }

            return {
                returnValues: { output: message.content },
                log: message.content,
            };
        }
    }

    // eslint-disable-next-line class-methods-use-this
    getFormatInstructions(): string {
        throw new Error(
            'getFormatInstructions not implemented inside OpenAIToolsAgentOutputParser.',
        );
    }
}

export async function createOpenAIToolsAgent({
    llm,
    tools,
    prompt,
    streamRunnable,
}: CreateOpenAIToolsAgentParams) {
    if (!prompt.inputVariables.includes('agent_scratchpad')) {
        throw new Error(
            [
                `Prompt must have an input variable named "agent_scratchpad".`,
                `Found ${JSON.stringify(prompt.inputVariables)} instead.`,
            ].join('\n'),
        );
    }
    const modelWithTools = llm.bind({
        tools: tools.map(formatToOpenAIAssistantTool),
    });
    const agent = AgentRunnableSequence.fromRunnables(
        [
            RunnablePassthrough.assign({
                agent_scratchpad: (
                    input: AnyType /* TODO: Fix type: { steps: ToolsAgentStep[] } */,
                ) => formatToToolMessages(input.steps),
            }) as AnyType, // TODO: Fix type
            prompt,
            modelWithTools,
            new OpenAIToolsAgentOutputParser(),
        ],
        {
            name: 'OpenAIToolsAgent',
            streamRunnable,
            singleAction: false,
        },
    );
    return agent;
}
