/**
 * MCP token-footprint probe.
 *
 * Loads the shared MCP tool definitions from `defineTool` in common, sends the
 * full toolset to provider-native token-counting endpoints, and compares the
 * resulting input token count with and without tools registered.
 *
 * The number that matters is the "tool overhead" = (input tokens with all tools)
 * minus (baseline input tokens with no tools). That's what plugging this MCP in
 * costs a client's context window, and what a dashboard should track over time.
 *
 * Run (from repo root):
 *   pnpm -F common mcp-token-probe
 *
 * Config via env:
 *   ANTHROPIC_API_KEY  enables the Anthropic measurement + per-tool breakdown
 *   OPENAI_API_KEY     enables the OpenAI measurement
 *   ANTHROPIC_MODEL    default claude-sonnet-4-6
 *   OPENAI_MODEL       default gpt-5.4-mini
 *
 * Flags:
 *   --json        also print a machine-readable JSON blob (dashboard-ready)
 *   --per-tool    per-tool breakdown via provider token-counting APIs
 *   --selftest    verify imports + tool conversion without network/keys
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { mcpToolDefinitions } from '../../src/ee/AiAgent/schemas/tools/toolDefinitions';

type McpTool = {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny;
    outputSchema: z.ZodTypeAny | undefined;
};

type ProviderResult = {
    provider: 'anthropic' | 'openai';
    model: string;
    baselineInputTokens: number;
    withToolsInputTokens: number;
    providerReportedToolOverheadTokens: number;
    outputSchemaTokens: number;
    toolOverheadWithOutputSchemasTokens: number;
};

type PerToolResult = {
    name: string;
    tokens: number;
    inputSchemaTokens: number;
    outputSchemaTokens: number;
};

type JsonObject = Record<string, unknown>;

type JsonObjectSchema = JsonObject & {
    type?: unknown;
};

type OpenAiFunctionTool = {
    type: 'function';
    name: string;
    description: string;
    parameters: JsonObject;
    strict: false;
};

type OpenAiInputTokenCountParams = {
    model: string;
    input: string;
    tools?: OpenAiFunctionTool[];
    tool_choice?: 'none';
};

const args = new Set(process.argv.slice(2));
const PROMPT = 'hi';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
const OPENAI_INPUT_TOKENS_URL =
    'https://api.openai.com/v1/responses/input_tokens';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

const isJsonObjectSchema = (value: unknown): value is JsonObjectSchema =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function schemaToJsonSchema(schema: z.ZodTypeAny): unknown {
    return zodToJsonSchema(schema, { target: 'jsonSchema7' });
}

function schemaToAnthropicInputSchema(
    schema: z.ZodTypeAny,
): Anthropic.Tool.InputSchema {
    const json = schemaToJsonSchema(schema);

    if (!isJsonObjectSchema(json) || json.type !== 'object') {
        throw new Error(
            'Expected MCP tool input schema to be an object schema',
        );
    }

    return { ...json, type: 'object' };
}

function getBuiltInMcpTools(): McpTool[] {
    return mcpToolDefinitions.map((definition) => {
        const view = definition.for('mcp');
        return {
            name: view.name,
            description: view.description,
            inputSchema: view.inputSchema,
            outputSchema: view.outputSchema,
        };
    });
}

function schemaToOpenAiParameters(schema: z.ZodTypeAny): JsonObject {
    const json = schemaToJsonSchema(schema);

    if (!isJsonObjectSchema(json) || json.type !== 'object') {
        throw new Error(
            'Expected MCP tool input schema to be an object schema',
        );
    }

    return { ...json, type: 'object' };
}

function toOpenAiFunctionTool(t: McpTool): OpenAiFunctionTool {
    return {
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: schemaToOpenAiParameters(t.inputSchema),
        strict: false,
    };
}

function parseOpenAiTokenCountResponse(value: unknown): number {
    if (!isJsonObjectSchema(value) || typeof value.input_tokens !== 'number') {
        throw new Error('OpenAI input token count response was invalid');
    }

    return value.input_tokens;
}

async function readResponseJson(response: Response): Promise<unknown> {
    const text = await response.text();

    try {
        const parsed: unknown = JSON.parse(text);
        return parsed;
    } catch {
        throw new Error(`Expected JSON response, got: ${text.slice(0, 200)}`);
    }
}

async function countOpenAiInputTokens(
    params: OpenAiInputTokenCountParams,
): Promise<number> {
    const response = await fetch(OPENAI_INPUT_TOKENS_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });
    const body = await readResponseJson(response);

    if (!response.ok) {
        const message =
            isJsonObjectSchema(body) && typeof body.error === 'object'
                ? JSON.stringify(body.error)
                : response.statusText;
        throw new Error(`OpenAI input token count failed: ${message}`);
    }

    return parseOpenAiTokenCountResponse(body);
}

async function countAnthropicOutputSchemaTokens(
    client: Anthropic,
    model: string,
    outputSchema: z.ZodTypeAny | undefined,
): Promise<number> {
    if (!outputSchema) {
        return 0;
    }

    const base = await client.messages.countTokens({
        model,
        messages: [{ role: 'user' as const, content: PROMPT }],
    });
    const withSchema = await client.messages.countTokens({
        model,
        messages: [
            {
                role: 'user' as const,
                content: `${PROMPT}\n${JSON.stringify(
                    schemaToJsonSchema(outputSchema),
                )}`,
            },
        ],
    });

    return withSchema.input_tokens - base.input_tokens;
}

async function countAnthropicOutputSchemasTokens(
    model: string,
    tools: McpTool[],
): Promise<number> {
    const client = new Anthropic();
    let total = 0;

    for (const t of tools) {
        // eslint-disable-next-line no-await-in-loop
        total += await countAnthropicOutputSchemaTokens(
            client,
            model,
            t.outputSchema,
        );
    }

    return total;
}

async function countOpenAiOutputSchemaTokens(
    model: string,
    outputSchema: z.ZodTypeAny | undefined,
): Promise<number> {
    if (!outputSchema) {
        return 0;
    }

    const baseline = await countOpenAiInputTokens({ model, input: PROMPT });
    const withSchema = await countOpenAiInputTokens({
        model,
        input: `${PROMPT}\n${JSON.stringify(schemaToJsonSchema(outputSchema))}`,
    });

    return withSchema - baseline;
}

async function countOpenAiOutputSchemasTokens(
    model: string,
    tools: McpTool[],
): Promise<number> {
    let total = 0;

    for (const t of tools) {
        // eslint-disable-next-line no-await-in-loop
        total += await countOpenAiOutputSchemaTokens(model, t.outputSchema);
    }

    return total;
}

async function probeAnthropicProvider(
    model: string,
    tools: McpTool[],
    outputSchemaTokens: number,
): Promise<ProviderResult> {
    const client = new Anthropic();
    const messages = [{ role: 'user' as const, content: PROMPT }];
    const baseline = await client.messages.countTokens({ model, messages });
    const withTools = await client.messages.countTokens({
        model,
        messages,
        tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: schemaToAnthropicInputSchema(t.inputSchema),
        })),
    });
    const providerReportedToolOverheadTokens =
        withTools.input_tokens - baseline.input_tokens;

    return {
        provider: 'anthropic',
        model,
        baselineInputTokens: baseline.input_tokens,
        withToolsInputTokens: withTools.input_tokens,
        providerReportedToolOverheadTokens,
        outputSchemaTokens,
        toolOverheadWithOutputSchemasTokens:
            providerReportedToolOverheadTokens + outputSchemaTokens,
    };
}

async function probeOpenAiProvider(
    model: string,
    tools: McpTool[],
    outputSchemaTokens: number,
): Promise<ProviderResult> {
    const baseline = await countOpenAiInputTokens({ model, input: PROMPT });
    const withTools = await countOpenAiInputTokens({
        model,
        input: PROMPT,
        tools: tools.map(toOpenAiFunctionTool),
        tool_choice: 'none',
    });
    const providerReportedToolOverheadTokens = withTools - baseline;

    return {
        provider: 'openai',
        model,
        baselineInputTokens: baseline,
        withToolsInputTokens: withTools,
        providerReportedToolOverheadTokens,
        outputSchemaTokens,
        toolOverheadWithOutputSchemasTokens:
            providerReportedToolOverheadTokens + outputSchemaTokens,
    };
}

/** Per-tool attribution via Anthropic count_tokens (no completion -> free, exact). */
async function perToolAnthropic(
    model: string,
    tools: McpTool[],
): Promise<PerToolResult[]> {
    const client = new Anthropic();
    const messages = [{ role: 'user' as const, content: PROMPT }];
    const base = await client.messages.countTokens({ model, messages });
    const out: PerToolResult[] = [];
    for (const t of tools) {
        // eslint-disable-next-line no-await-in-loop
        const r = await client.messages.countTokens({
            model,
            messages,
            tools: [
                {
                    name: t.name,
                    description: t.description,
                    input_schema: schemaToAnthropicInputSchema(t.inputSchema),
                },
            ],
        });
        // eslint-disable-next-line no-await-in-loop
        const outputSchemaTokens = await countAnthropicOutputSchemaTokens(
            client,
            model,
            t.outputSchema,
        );
        const inputSchemaTokens = r.input_tokens - base.input_tokens;
        out.push({
            name: t.name,
            tokens: inputSchemaTokens + outputSchemaTokens,
            inputSchemaTokens,
            outputSchemaTokens,
        });
    }
    return out.sort((a, b) => b.tokens - a.tokens);
}

async function perToolOpenAi(
    model: string,
    tools: McpTool[],
): Promise<PerToolResult[]> {
    const base = await countOpenAiInputTokens({ model, input: PROMPT });
    const out: PerToolResult[] = [];

    for (const t of tools) {
        // eslint-disable-next-line no-await-in-loop
        const inputTokens = await countOpenAiInputTokens({
            model,
            input: PROMPT,
            tools: [toOpenAiFunctionTool(t)],
            tool_choice: 'none',
        });
        // eslint-disable-next-line no-await-in-loop
        const outputSchemaTokens = await countOpenAiOutputSchemaTokens(
            model,
            t.outputSchema,
        );
        const inputSchemaTokens = inputTokens - base;
        out.push({
            name: t.name,
            tokens: inputSchemaTokens + outputSchemaTokens,
            inputSchemaTokens,
            outputSchemaTokens,
        });
    }

    return out.sort((a, b) => b.tokens - a.tokens);
}

function printPerToolResults(provider: string, perTool: PerToolResult[]) {
    const sum = perTool.reduce((a, b) => a + b.tokens, 0);
    console.log(`\nPer-tool (${provider}, input + output schemas):`);
    for (const {
        name,
        tokens,
        inputSchemaTokens,
        outputSchemaTokens: toolOutputSchemaTokens,
    } of perTool) {
        const pct = sum ? Math.round((100 * tokens) / sum) : 0;
        const outputSuffix = toolOutputSchemaTokens
            ? `, output ${fmt(toolOutputSchemaTokens)}`
            : '';
        console.log(
            `  - ${name} — ${fmt(tokens)} (${pct}%; input ${fmt(
                inputSchemaTokens,
            )}${outputSuffix})`,
        );
    }
    console.log(`  - total (sum of marginals) — ${fmt(sum)}`);
}

function selftest() {
    const sample: McpTool[] = [
        {
            name: 'run_metric_query',
            description: 'Run a semantic-layer metric query',
            inputSchema: z.object({ explore: z.string() }),
            outputSchema: z.object({ rows: z.array(z.unknown()) }),
        },
    ];
    const openAiTools = sample.map(toOpenAiFunctionTool);
    const anthropicTools = sample.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: schemaToAnthropicInputSchema(t.inputSchema),
    }));
    const ok =
        openAiTools.length === sample.length &&
        anthropicTools.length === sample.length;
    console.log(
        `selftest: imports OK, converted ${sample.length} tool(s) -> ${
            ok ? 'PASS' : 'FAIL'
        }`,
    );
    process.exit(ok ? 0 : 1);
}

async function main() {
    if (args.has('--selftest')) {
        selftest();
        return;
    }

    const tools = getBuiltInMcpTools();
    const toolsWithOutputSchema = tools.filter(
        (t) => t.outputSchema !== undefined,
    ).length;

    console.log('MCP tools source: shared defineTool definitions');
    console.log(`Tools preloaded: ${tools.length}`);
    console.log(`Tools with output schemas: ${toolsWithOutputSchema}\n`);

    const results: ProviderResult[] = [];

    if (process.env.ANTHROPIC_API_KEY) {
        const outputSchemaTokens = await countAnthropicOutputSchemasTokens(
            ANTHROPIC_MODEL,
            tools,
        );
        results.push(
            await probeAnthropicProvider(
                ANTHROPIC_MODEL,
                tools,
                outputSchemaTokens,
            ),
        );
    } else {
        console.log('Anthropic: skipped (ANTHROPIC_API_KEY not set)');
    }
    if (process.env.OPENAI_API_KEY) {
        const outputSchemaTokens = await countOpenAiOutputSchemasTokens(
            OPENAI_MODEL,
            tools,
        );
        results.push(
            await probeOpenAiProvider(OPENAI_MODEL, tools, outputSchemaTokens),
        );
    } else {
        console.log('OpenAI: skipped (OPENAI_API_KEY not set)');
    }

    for (const r of results) {
        console.log(
            `\n${r.provider} (${r.model})\n` +
                `  baseline input:      ${fmt(r.baselineInputTokens)}\n` +
                `  with all tools:      ${fmt(r.withToolsInputTokens)}\n` +
                `  provider overhead:   ${fmt(
                    r.providerReportedToolOverheadTokens,
                )}\n` +
                `  output schemas:      ${fmt(r.outputSchemaTokens)}\n` +
                `  overhead + outputs:  ${fmt(
                    r.toolOverheadWithOutputSchemasTokens,
                )}  <- MCP footprint`,
        );
    }

    let perTool: PerToolResult[] = [];
    let perToolOpenai: PerToolResult[] = [];
    if (args.has('--per-tool') && process.env.ANTHROPIC_API_KEY) {
        perTool = await perToolAnthropic(ANTHROPIC_MODEL, tools);
        printPerToolResults('Anthropic count_tokens', perTool);
    }
    if (args.has('--per-tool') && process.env.OPENAI_API_KEY) {
        perToolOpenai = await perToolOpenAi(OPENAI_MODEL, tools);
        printPerToolResults(
            'OpenAI responses.input_tokens.count',
            perToolOpenai,
        );
    }

    if (args.has('--json')) {
        console.log(
            `\n${JSON.stringify(
                {
                    measuredAt: new Date().toISOString(),
                    toolSource: 'shared_define_tool_definitions',
                    toolCount: tools.length,
                    toolsWithOutputSchema,
                    providers: results,
                    perTool,
                    perToolOpenai,
                },
                null,
                2,
            )}`,
        );
    }
}

main().catch((err) => {
    console.error('probe failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
