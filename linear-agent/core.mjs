import {
    createHash,
    createHmac,
    timingSafeEqual,
} from 'node:crypto';

export const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;

export function parseJson(value, label = 'JSON') {
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`Invalid ${label}: ${error.message}`);
    }
}

export function verifyLinearWebhook({
    body,
    signature,
    timestamp,
    secret,
    now = Date.now(),
}) {
    if (!signature || !timestamp || !secret) return false;
    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber)) return false;
    if (Math.abs(now - timestampNumber) > MAX_WEBHOOK_AGE_MS) return false;

    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
    );
}

export function sessionIdToJobId(sessionId) {
    return createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}

export function sessionIdToVmName(sessionId) {
    return `ldlin-${sessionIdToJobId(sessionId).slice(0, 12)}`;
}

export function validateVmName(vmName) {
    if (!/^ldlin-[a-f0-9]{12}$/.test(vmName)) {
        throw new Error(`Unsafe runner VM name: ${vmName}`);
    }
    return vmName;
}

export function validateTemplateVmName(vmName) {
    if (!/^ld-linear-agent-template(?:-[a-z0-9]+)*$/.test(vmName)) {
        throw new Error(`Unsafe runner template VM name: ${vmName}`);
    }
    return vmName;
}

export function shellQuote(value) {
    return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function extractPrompt(payload) {
    if (payload.action === 'created') {
        return (
            payload.promptContext ||
            payload.agentSession?.comment?.body ||
            payload.agentSession?.issue?.title ||
            ''
        );
    }
    if (payload.action === 'prompted') {
        return (
            payload.agentActivity?.body ||
            payload.agentActivity?.content?.body ||
            ''
        );
    }
    return '';
}

export function branchName(issueIdentifier, jobId) {
    const issue = String(issueIdentifier || 'linear')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return `linear/${issue || 'issue'}-${jobId.slice(0, 6)}`;
}

const SEMANTIC_TITLE_PATTERN = /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([a-z0-9][a-z0-9-]*\))?!?: .+/;

export function semanticPullRequestTitle(candidate, fallback) {
    const normalized = String(candidate || '').trim().replace(/\s+/g, ' ');
    if (
        normalized.length <= 120 &&
        SEMANTIC_TITLE_PATTERN.test(normalized)
    ) {
        return normalized;
    }
    const description = String(fallback || 'implement Linear request')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^[A-Z]/, (letter) => letter.toLowerCase())
        .slice(0, 110);
    return `fix: ${description || 'implement Linear request'}`;
}

const LINEAR_ISSUE_IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9]*-[1-9][0-9]*$/;

export function validateLinearIssueIdentifier(identifier) {
    const normalized = String(identifier || '').trim().toUpperCase();
    if (!LINEAR_ISSUE_IDENTIFIER_PATTERN.test(normalized)) {
        throw new Error(`Invalid Linear issue identifier: ${identifier}`);
    }
    return normalized;
}

export function extractParentIssueIdentifier(promptContext) {
    const match = String(promptContext || '').match(
        /<parent-issue\b[^>]*\bidentifier=(?:"([^"]+)"|'([^']+)')[^>]*>/i,
    );
    if (!match) return null;
    try {
        return validateLinearIssueIdentifier(match[1] || match[2]);
    } catch {
        return null;
    }
}

export function githubIssueNumberFromUrl(value, repository) {
    let url;
    try {
        url = new URL(String(value || ''));
    } catch {
        return null;
    }
    const [owner, name, extra] = String(repository || '').split('/');
    if (!owner || !name || extra || url.protocol !== 'https:' || url.hostname !== 'github.com') {
        return null;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (
        parts.length !== 4 ||
        parts[0].toLowerCase() !== owner.toLowerCase() ||
        parts[1].toLowerCase() !== name.toLowerCase() ||
        parts[2] !== 'issues' ||
        !/^[1-9][0-9]*$/.test(parts[3])
    ) {
        return null;
    }
    const number = Number(parts[3]);
    return Number.isSafeInteger(number) ? number : null;
}

export function githubIssueNumbersFromUrls(values, repository) {
    const numbers = (Array.isArray(values) ? values : [])
        .map((value) => githubIssueNumberFromUrl(value, repository))
        .filter((value) => value !== null);
    return [...new Set(numbers)];
}

export function pullRequestReferenceLines({
    linearIssueIdentifier,
    githubIssueNumbers = [],
    parentGithubIssueNumbers = [],
    parentIssueIdentifier = null,
}) {
    const lines = [`Closes: ${validateLinearIssueIdentifier(linearIssueIdentifier)}`];
    const direct = new Set(
        githubIssueNumbers.filter((number) => Number.isSafeInteger(number) && number > 0),
    );
    for (const number of direct) lines.push(`Closes: #${number}`);
    if (parentIssueIdentifier) {
        validateLinearIssueIdentifier(parentIssueIdentifier);
        const related = new Set(
            parentGithubIssueNumbers.filter(
                (number) => Number.isSafeInteger(number) && number > 0 && !direct.has(number),
            ),
        );
        for (const number of related) lines.push(`Relates: #${number}`);
    }
    return lines;
}

export function evidenceFileName(value, index) {
    const stem = String(value || `screenshot-${index}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return `${stem || `screenshot-${index}`}.jpg`;
}
