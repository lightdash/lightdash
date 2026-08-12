const fs = require('node:fs');
const readline = require('node:readline');

const [logPath] = process.argv.slice(2);
const callbackUrl = process.env.LINEAR_AGENT_CALLBACK_URL;
const jobId = process.env.LINEAR_AGENT_JOB_ID;
const jobToken = process.env.LINEAR_AGENT_JOB_TOKEN;

const redact = (value) => String(value || '')
    .replace(/\b(ghp|github_pat|sk)-?[A-Za-z0-9_]{16,}\b/g, '[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(authorization|api[_-]?key|token|secret|password)\s*([=:])\s*\S+/gi, '$1$2[REDACTED]');

const truncate = (value, maximum = 3000) => {
    const text = redact(value).trim();
    return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
};

const render = (value) => {
    if (typeof value === 'string') return truncate(value);
    if (value === undefined || value === null) return '';
    return truncate(JSON.stringify(value, null, 2));
};

const codeBlock = (value, language = '') => {
    const body = truncate(value, 2500);
    const fence = body.includes('```') ? '````' : '```';
    return body ? `${fence}${language}\n${body}\n${fence}` : '';
};

const reasoningText = (item) => {
    if (typeof item.text === 'string') return item.text;
    if (typeof item.summary === 'string') return item.summary;
    if (Array.isArray(item.summary)) {
        return item.summary.map((part) => part.text || part).join('\n');
    }
    return '';
};

function activityFor(event) {
    if (event.type !== 'item.completed' || !event.item) return null;
    const item = event.item;
    if (item.type === 'reasoning') {
        const body = truncate(reasoningText(item));
        return body ? { type: 'thought', body } : null;
    }
    if (item.type === 'command_execution') {
        const output = item.aggregated_output || item.output || item.result || '';
        const status = item.exit_code === undefined
            ? item.status || 'completed'
            : `exit ${item.exit_code}`;
        return {
            type: 'action',
            action: 'Ran command',
            parameter: codeBlock(item.command || item.command_line || '', 'sh'),
            result: [status, codeBlock(render(output))].filter(Boolean).join('\n\n'),
        };
    }
    if (item.type === 'file_change') {
        const changes = Array.isArray(item.changes) ? item.changes : [];
        const files = changes.map((change) => {
            const kind = change.kind || change.type || 'updated';
            return `- \`${change.path || change.file || 'unknown'}\` — ${kind}`;
        });
        return {
            type: 'action',
            action: 'Changed files',
            parameter: files.join('\n') || render(item),
            result: item.status || 'completed',
        };
    }
    if (item.type === 'mcp_tool_call') {
        const tool = item.tool || item.name || 'tool';
        const server = item.server ? `${item.server}: ` : '';
        return {
            type: 'action',
            action: `Used ${server}${tool}`,
            parameter: codeBlock(render(item.arguments || item.input), 'json'),
            result: codeBlock(render(item.result || item.output || item.error)),
        };
    }
    if (item.type === 'web_search') {
        return {
            type: 'action',
            action: 'Searched the web',
            parameter: truncate(item.query || item.search_query || render(item)),
            result: truncate(item.result || item.status || 'completed'),
        };
    }
    if (item.type === 'todo_list' || item.type === 'plan') {
        return {
            type: 'action',
            action: 'Updated plan',
            parameter: render(item.items || item.plan || item),
            result: item.status || 'updated',
        };
    }
    return null;
}

async function postActivity(content) {
    const response = await fetch(`${callbackUrl}/jobs/${jobId}/events`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${jobToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'codex-activity', content }),
    });
    if (!response.ok) throw new Error(`Linear activity relay failed with HTTP ${response.status}`);
}

async function main() {
    if (!logPath || !callbackUrl || !jobId || !jobToken) {
        throw new Error('Codex event streaming configuration is incomplete');
    }
    const log = fs.createWriteStream(logPath, { flags: 'a', mode: 0o600 });
    const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of lines) {
        log.write(`${line}\n`);
        let event;
        try {
            event = JSON.parse(line);
        } catch {
            continue;
        }
        const activity = activityFor(event);
        if (!activity) continue;
        try {
            await postActivity(activity);
        } catch (error) {
            process.stderr.write(`${error.message}\n`);
        }
    }
    await new Promise((resolve) => log.end(resolve));
}

module.exports = { activityFor };

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error.stack || error.message}\n`);
        process.exitCode = 1;
    });
}
