#!/usr/bin/env npx tsx
import { execSync } from 'child_process';

// ============================================================================
// Types
// ============================================================================

interface GitHubPR {
    number: number;
    title: string;
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    isDraft: boolean;
    url: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    mergedAt: string | null;
    closedAt: string | null;
    reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
    headRefName: string;
}

interface GitHubIssue {
    number: number;
    title: string;
    state: 'OPEN' | 'CLOSED';
    url: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    body: string;
}

interface LinearIssue {
    id: string;
    identifier: string;
    title: string;
    state: { name: string };
    url: string;
}

interface LinearTeam {
    key: string;
}

interface WorkItem {
    type: 'pr' | 'issue';
    number: number;
    title: string;
    url: string;
    state: string;
    isDraft?: boolean;
    reviewDecision?: string | null;
    branch?: string;
    closesGitHub: number[];
    closesLinear: string[];
    depth: number; // graphite stack depth
    createdAt: Date;
    mergedAt?: Date | null;
    closedAt?: Date | null;
}

type Group = 'in_progress' | 'done' | 'closed' | 'issues';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): {
    since: string;
    includeClosed: boolean;
    includeIssues: boolean;
    copy: boolean;
} {
    const args = process.argv.slice(2);
    let since = 'today';
    let includeClosed = false;
    let includeIssues = false;
    let copy = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--since' && args[i + 1]) {
            since = args[++i];
        } else if (arg.startsWith('--since=')) {
            since = arg.slice(8);
        } else if (arg === '--include-closed' || arg === '-c') {
            includeClosed = true;
        } else if (arg === '--include-issues' || arg === '-i') {
            includeIssues = true;
        } else if (arg === '--copy') {
            copy = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: pnpm signoff [options]

Options:
  --since <date>      Show items since date (default: "today", accepts "yesterday", "1 week ago", etc.)
  --include-closed    Include closed PRs
  -c                  Shorthand for --include-closed
  --include-issues    Include issues you created
  -i                  Shorthand for --include-issues
  --copy              Copy output to clipboard (pbcopy)
  --help, -h          Show this help message
`);
            process.exit(0);
        }
    }

    return { since, includeClosed, includeIssues, copy };
}

// ============================================================================
// Date Utilities
// ============================================================================

function parseSinceDate(dateStr: string): { start: Date; end: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const normalized = dateStr.toLowerCase().trim();

    if (normalized === 'today') {
        return { start: today, end: now };
    }

    if (normalized === 'yesterday') {
        return {
            start: new Date(today.getTime() - 24 * 60 * 60 * 1000),
            end: now,
        };
    }

    // Parse "N days/weeks/months ago"
    const agoMatch = normalized.match(
        /^(\d+)\s*(day|days|week|weeks|month|months)\s*ago$/
    );
    if (agoMatch) {
        const count = parseInt(agoMatch[1], 10);
        const unit = agoMatch[2];
        let ms: number;
        if (unit.startsWith('day')) {
            ms = count * 24 * 60 * 60 * 1000;
        } else if (unit.startsWith('week')) {
            ms = count * 7 * 24 * 60 * 60 * 1000;
        } else {
            // Approximate month as 30 days
            ms = count * 30 * 24 * 60 * 60 * 1000;
        }
        return {
            start: new Date(today.getTime() - ms),
            end: now,
        };
    }

    // Try native date parsing
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        const dayStart = new Date(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate()
        );
        return { start: dayStart, end: now };
    }

    console.error(`Could not parse date: ${dateStr}`);
    process.exit(1);
}

function isInDateRange(
    date: Date | string | null | undefined,
    range: { start: Date; end: Date }
): boolean {
    if (!date) return false;
    const d = typeof date === 'string' ? new Date(date) : date;
    return d >= range.start && d < range.end;
}

// ============================================================================
// GitHub CLI Helpers
// ============================================================================

function exec(cmd: string, trim = true): string {
    try {
        const result = execSync(cmd, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return trim ? result.trim() : result;
    } catch {
        return '';
    }
}

function fetchGitHubPRs(includeClosed: boolean): GitHubPR[] {
    // Note: `closed` already includes merged PRs in GitHub CLI results.
    // Querying both `closed` and `merged` causes duplicates.
    const states = includeClosed ? ['open', 'closed'] : ['open', 'merged'];
    const allPRs: GitHubPR[] = [];

    for (const state of states) {
        const json = exec(
            `gh pr list --author @me --state ${state} --limit 100 --json number,title,state,isDraft,url,body,createdAt,updatedAt,mergedAt,closedAt,reviewDecision,headRefName`
        );
        if (json) {
            try {
                const prs = JSON.parse(json) as GitHubPR[];
                allPRs.push(...prs);
            } catch {
                // ignore parse errors
            }
        }
    }

    // Safety dedupe in case GitHub CLI behavior changes or overlapping results occur.
    return Array.from(new Map(allPRs.map((pr) => [pr.number, pr])).values());
}

function fetchGitHubIssues(includeClosed: boolean): GitHubIssue[] {
    const state = includeClosed ? 'all' : 'open';
    const json = exec(
        `gh issue list --author @me --state ${state} --limit 100 --json number,title,state,url,createdAt,updatedAt,closedAt,body`
    );
    if (!json) return [];
    try {
        return JSON.parse(json) as GitHubIssue[];
    } catch {
        return [];
    }
}

function fetchGitHubIssueBody(issueNumber: number): string {
    const json = exec(`gh issue view ${issueNumber} --json body`);
    if (!json) return '';
    try {
        const data = JSON.parse(json);
        return data.body || '';
    } catch {
        return '';
    }
}

// ============================================================================
// Graphite CLI Helpers
// ============================================================================

interface GraphiteStackInfo {
    branch: string;
    depth: number;
}

function fetchGraphiteStacks(): Map<string, GraphiteStackInfo> {
    const stacks = new Map<string, GraphiteStackInfo>();

    // Use gt log --classic which shows clean indentation
    // Format: "  ↱ $ branch_name" where indentation = depth * 2
    const logOutput = exec('gt log --classic 2>/dev/null', false);
    if (!logOutput.trim()) return stacks;

    const lines = logOutput.split('\n').filter((l) => l.trim());

    for (const line of lines) {
        // Match: leading spaces, then ↱ $, then branch name
        const match = line.match(/^(\s*)↱ \$ (.+?)(?:\s+\(.*\))?$/);
        if (!match) continue;

        const indent = match[1].length;
        let branch = match[2].trim();

        // Skip main/master trunk
        if (branch === 'main' || branch === 'master') continue;

        // Depth is indent / 2, but relative to main (which is at depth 0)
        // So depth 1 = direct child of main, etc.
        const depth = Math.floor(indent / 2);

        stacks.set(branch, { branch, depth });
    }

    return stacks;
}

function getStackDepth(
    branch: string,
    stacks: Map<string, GraphiteStackInfo>
): number {
    const info = stacks.get(branch);
    if (!info) return 0;
    // Subtract 1 since main is at depth 0 in graphite but we want
    // direct children of main to be at depth 0 in our output
    return Math.max(0, info.depth - 1);
}

// ============================================================================
// Linear API Helpers
// ============================================================================

async function fetchLinearIssue(identifier: string): Promise<LinearIssue | null> {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey,
            },
            body: JSON.stringify({
                query: `
                    query GetIssue($identifier: String!) {
                        issue(id: $identifier) {
                            id
                            identifier
                            title
                            url
                            state { name }
                        }
                    }
                `,
                variables: { identifier },
            }),
        });

        const data = (await response.json()) as {
            data?: { issue?: LinearIssue };
        };
        return data.data?.issue || null;
    } catch {
        return null;
    }
}

async function fetchLinearIssueByIdentifier(
    identifier: string
): Promise<LinearIssue | null> {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) return null;

    try {
        const [teamKey, numberStr] = identifier.split('-');
        const number = parseInt(numberStr, 10);

        const response = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey,
            },
            body: JSON.stringify({
                query: `
                    query GetIssueByNumber($teamKey: String!, $number: Float!) {
                        issueVcsBranchSearch(branchName: "${teamKey}-${number}") {
                            id
                            identifier
                            title
                            url
                            state { name }
                        }
                    }
                `,
            }),
        });

        const data = (await response.json()) as {
            data?: { issueVcsBranchSearch?: LinearIssue };
        };
        return data.data?.issueVcsBranchSearch || null;
    } catch {
        return null;
    }
}

async function searchLinearByIdentifier(
    identifier: string
): Promise<LinearIssue | null> {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey,
            },
            body: JSON.stringify({
                query: `
                    query SearchIssue($filter: IssueFilter!) {
                        issues(filter: $filter, first: 1) {
                            nodes {
                                id
                                identifier
                                title
                                url
                                state { name }
                            }
                        }
                    }
                `,
                variables: {
                    filter: {
                        number: { eq: parseInt(identifier.split('-')[1], 10) },
                        team: { key: { eq: identifier.split('-')[0] } },
                    },
                },
            }),
        });

        const data = (await response.json()) as {
            data?: { issues?: { nodes?: LinearIssue[] } };
        };
        return data.data?.issues?.nodes?.[0] || null;
    } catch {
        return null;
    }
}

async function fetchLinearTeamKeys(): Promise<Set<string> | null> {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey,
            },
            body: JSON.stringify({
                query: `
                    query GetTeams {
                        teams(first: 250) {
                            nodes {
                                key
                            }
                        }
                    }
                `,
            }),
        });

        const data = (await response.json()) as {
            data?: { teams?: { nodes?: LinearTeam[] } };
        };
        const keys =
            data.data?.teams?.nodes
                ?.map((team) => team.key?.toUpperCase())
                .filter((key): key is string => Boolean(key)) ?? [];

        return new Set(keys);
    } catch {
        return null;
    }
}

// ============================================================================
// Link Extraction
// ============================================================================

// GitHub linking keywords: close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved
const LINK_KEYWORDS = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)/i;

function extractGitHubIssueNumbers(text: string): number[] {
    const numbers = new Set<number>();

    // Match "Closes #123", "Closes: #123", "Fixes #123", etc.
    const hashMatches = text.matchAll(
        new RegExp(`${LINK_KEYWORDS.source}:?\\s*#(\\d+)`, 'gi')
    );
    for (const match of hashMatches) {
        numbers.add(parseInt(match[1], 10));
    }

    // Match full GitHub issue URLs: "Closes https://github.com/owner/repo/issues/123"
    const urlMatches = text.matchAll(
        new RegExp(
            `${LINK_KEYWORDS.source}:?\\s*https?://github\\.com/[^/]+/[^/]+/issues/(\\d+)`,
            'gi'
        )
    );
    for (const match of urlMatches) {
        numbers.add(parseInt(match[1], 10));
    }

    return Array.from(numbers);
}

function filterLinearIdentifiers(
    candidates: Set<string>,
    linearTeamKeys: Set<string> | null
): string[] {
    if (!linearTeamKeys) return [];

    return Array.from(candidates).filter((identifier) => {
        const [teamKey] = identifier.split('-');
        return linearTeamKeys.has(teamKey.toUpperCase());
    });
}

function extractLinearIdentifiers(
    text: string,
    linearTeamKeys: Set<string> | null
): string[] {
    const identifiers = new Set<string>();

    // Match "Closes PROD-123", "Fixes ZAP-456", etc.
    const idMatches = text.matchAll(
        new RegExp(`${LINK_KEYWORDS.source}:?\\s*([A-Z]{2,}-\\d+)`, 'gi')
    );
    for (const match of idMatches) {
        identifiers.add(match[1].toUpperCase());
    }

    // Match markdown links: "Closes: [PROD-123](url)" or "Closes [PROD-123](url)"
    const mdMatches = text.matchAll(
        new RegExp(`${LINK_KEYWORDS.source}:?\\s*\\[([A-Z]{2,}-\\d+)\\]\\(`, 'gi')
    );
    for (const match of mdMatches) {
        identifiers.add(match[1].toUpperCase());
    }

    // Match Linear URLs: "Closes https://linear.app/team/issue/PROD-123/title"
    const urlMatches = text.matchAll(
        new RegExp(
            `${LINK_KEYWORDS.source}:?\\s*https?://linear\\.app/[^/]+/issue/([A-Z]{2,}-\\d+)`,
            'gi'
        )
    );
    for (const match of urlMatches) {
        identifiers.add(match[1].toUpperCase());
    }

    return filterLinearIdentifiers(identifiers, linearTeamKeys);
}

function extractLinearFromBranch(
    branchName: string,
    linearTeamKeys: Set<string> | null
): string[] {
    // Branch names often contain Linear ID directly: feat/PROD-123-description
    const matches = branchName.matchAll(/\b([A-Z]{2,}-\d+)\b/gi);
    const identifiers = new Set<string>();
    for (const match of matches) {
        identifiers.add(match[1].toUpperCase());
    }
    return filterLinearIdentifiers(identifiers, linearTeamKeys);
}

// ============================================================================
// Grouping Logic
// ============================================================================

function groupWorkItem(item: WorkItem): Group {
    if (item.type === 'issue') {
        return 'issues';
    }

    // PR grouping
    if (item.state === 'MERGED') {
        return 'done';
    }

    if (item.state === 'CLOSED') {
        return 'closed';
    }

    // All open PRs go to in_progress
    return 'in_progress';
}

// ============================================================================
// Formatting
// ============================================================================

function formatWorkItem(item: WorkItem, linearCache: Map<string, LinearIssue>): string {
    const indent = item.depth > 0 ? `${'  '.repeat(item.depth)}↳ ` : '';

    // Status emoji
    let emoji: string;
    if (item.type === 'issue') {
        emoji = ':issue:';
    } else if (item.state === 'MERGED') {
        emoji = ':pr-merged:';
    } else if (item.isDraft) {
        emoji = ':white_square:';
    } else if (item.reviewDecision === 'APPROVED') {
        emoji = ':pr: :approved:';
    } else {
        emoji = ':pr:';
    }

    // Title and markdown link [#number](URL)
    let line = `${indent}${emoji} ${item.title} [#${item.number}](${item.url})`;

    // Closes GitHub issues (markdown links)
    if (item.closesGitHub.length > 0) {
        // Extract repo from item URL: https://github.com/owner/repo/pull/123
        const repoMatch = item.url.match(/github\.com\/([^/]+\/[^/]+)/);
        const repo = repoMatch ? repoMatch[1] : 'lightdash/lightdash';
        const ghLinks = item.closesGitHub
            .map((n) => `[#${n}](https://github.com/${repo}/issues/${n})`)
            .join(', ');
        line += ` - Closes ${ghLinks}`;
    }

    // Linear links (markdown format) - only include verified issues
    if (item.closesLinear.length > 0) {
        for (const linearId of item.closesLinear) {
            const linearIssue = linearCache.get(linearId);
            if (linearIssue) {
                line += ` :linear: [${linearId}](${linearIssue.url})`;
            }
        }
    }

    return line;
}

function formatGroup(name: string): string {
    return `${name}:`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    const { since, includeClosed, includeIssues, copy } = parseArgs();
    const dateRange = parseSinceDate(since);

    // Fetch data
    const prs = fetchGitHubPRs(includeClosed);
    const graphiteStacks = fetchGraphiteStacks();
    const linearTeamKeys = await fetchLinearTeamKeys();

    // Build work items from PRs
    const workItems: WorkItem[] = [];
    const linearIdsToFetch = new Set<string>();

    for (const pr of prs) {
        // Check date relevance - include if created, updated, merged, or closed in range
        const isRelevant =
            isInDateRange(pr.createdAt, dateRange) ||
            isInDateRange(pr.updatedAt, dateRange) ||
            isInDateRange(pr.mergedAt, dateRange) ||
            isInDateRange(pr.closedAt, dateRange);
        if (!isRelevant) {
            continue;
        }

        const closesGitHub = extractGitHubIssueNumbers(pr.body || '');
        const closesLinear = extractLinearIdentifiers(
            pr.body || '',
            linearTeamKeys
        );

        // Also check branch name for Linear ID
        const branchLinear = extractLinearFromBranch(
            pr.headRefName,
            linearTeamKeys
        );
        for (const id of branchLinear) {
            if (!closesLinear.includes(id)) {
                closesLinear.push(id);
            }
        }

        for (const id of closesLinear) {
            linearIdsToFetch.add(id);
        }

        const depth = getStackDepth(pr.headRefName, graphiteStacks);

        workItems.push({
            type: 'pr',
            number: pr.number,
            title: pr.title,
            url: pr.url,
            state: pr.state,
            isDraft: pr.isDraft,
            reviewDecision: pr.reviewDecision,
            branch: pr.headRefName,
            closesGitHub,
            closesLinear,
            depth,
            createdAt: new Date(pr.createdAt),
            mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : null,
            closedAt: pr.closedAt ? new Date(pr.closedAt) : null,
        });
    }

    // Fetch issues if requested
    if (includeIssues) {
        const issues = fetchGitHubIssues(includeClosed);
        for (const issue of issues) {
            const isRelevant =
                isInDateRange(issue.createdAt, dateRange) ||
                isInDateRange(issue.updatedAt, dateRange) ||
                isInDateRange(issue.closedAt, dateRange);
            if (!isRelevant) {
                continue;
            }

            const closesLinear = extractLinearIdentifiers(
                issue.body || '',
                linearTeamKeys
            );
            for (const id of closesLinear) {
                linearIdsToFetch.add(id);
            }

            workItems.push({
                type: 'issue',
                number: issue.number,
                title: issue.title,
                url: issue.url,
                state: issue.state,
                closesGitHub: [],
                closesLinear,
                depth: 0,
                createdAt: new Date(issue.createdAt),
                closedAt: issue.closedAt ? new Date(issue.closedAt) : null,
            });
        }
    }

    // Fetch Linear issues
    const linearCache = new Map<string, LinearIssue>();
    if (process.env.LINEAR_API_KEY) {
        for (const id of linearIdsToFetch) {
            const issue = await searchLinearByIdentifier(id);
            if (issue) {
                linearCache.set(id, issue);
            }
        }
    }

    // Cross-link: check GitHub issues for Linear IDs
    for (const item of workItems) {
        for (const ghIssueNum of item.closesGitHub) {
            const body = fetchGitHubIssueBody(ghIssueNum);
            const linearIds = extractLinearIdentifiers(body, linearTeamKeys);
            for (const id of linearIds) {
                if (!item.closesLinear.includes(id)) {
                    item.closesLinear.push(id);
                    if (process.env.LINEAR_API_KEY && !linearCache.has(id)) {
                        const issue = await searchLinearByIdentifier(id);
                        if (issue) {
                            linearCache.set(id, issue);
                        }
                    }
                }
            }
        }
    }

    // Sort PRs by graphite stack order (depth), keeping tree structure
    const prItems = workItems.filter((i) => i.type === 'pr');
    const issueItems = workItems.filter((i) => i.type === 'issue');

    // Sort by depth ascending (parents before children)
    prItems.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.number - b.number;
    });

    // Build output with status headers as separators
    const output: string[] = [];

    const groupLabels: Record<Group, string> = {
        done: 'Done',
        in_progress: 'In progress',
        closed: 'Closed',
        issues: 'Issues I created',
    };

    // Group order for PRs: done, in_progress
    const groupOrder: Group[] = ['done', 'in_progress'];
    if (includeClosed) groupOrder.push('closed');

    // Group PRs but maintain tree order within output
    for (const group of groupOrder) {
        const items = prItems.filter((i) => groupWorkItem(i) === group);
        if (items.length === 0) continue;

        output.push(formatGroup(groupLabels[group]));
        for (const item of items) {
            output.push(formatWorkItem(item, linearCache));
        }
    }

    // Add issues at the end if requested
    if (includeIssues && issueItems.length > 0) {
        output.push(formatGroup(groupLabels.issues));
        for (const item of issueItems) {
            output.push(formatWorkItem(item, linearCache));
        }
    }

    const result = output.join('\n');

    if (result.trim() === '') {
        console.log(`No work items found since ${since}.`);
        return;
    }

    console.log(result);

    if (copy) {
        try {
            execSync('pbcopy', { input: result });
            console.log('\n(Copied to clipboard)');
        } catch {
            console.log('\n(Failed to copy to clipboard)');
        }
    }
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
