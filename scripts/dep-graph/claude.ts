import { execSync } from 'child_process';
import { escapeShellArg } from './utils';

interface CallClaudeOpts<T> {
    prompt: string;
    jsonSchema: object;
    model?: string;
}

export function callClaude<T>(opts: CallClaudeOpts<T>): T {
    const { prompt, jsonSchema, model = 'sonnet' } = opts;

    const result = execSync(
        `echo ${escapeShellArg(prompt)} | claude -p --dangerously-skip-permissions --output-format json --json-schema ${escapeShellArg(JSON.stringify(jsonSchema))} --model ${model}`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    );

    const parsed = JSON.parse(result);
    return (parsed.structured_output ?? parsed) as T;
}
