import * as path from 'path';
import { execSync } from 'child_process';
import { resolveFilePath } from './complexity';
import type { GraphNode, RecentCommit } from './types';

export function collectGitActivity(nodes: GraphNode[], includeEe: boolean): void {
    const repoRoot = path.resolve(__dirname, '../..');
    const relPathToNode = new Map<string, GraphNode>();
    for (const n of nodes) {
        const fp = resolveFilePath(n.id, n.type, n.ee);
        if (fp) {
            relPathToNode.set(path.relative(repoRoot, fp), n);
        }
    }

    if (relPathToNode.size === 0) return;

    const dirs = [
        'packages/backend/src/services/',
        'packages/backend/src/models/',
        'packages/backend/src/clients/',
        'packages/backend/src/controllers/',
        'packages/backend/src/routers/',
    ];

    if (includeEe) {
        dirs.push(
            'packages/backend/src/ee/controllers/',
            'packages/backend/src/ee/services/',
            'packages/backend/src/ee/models/',
            'packages/backend/src/ee/clients/',
        );
    }

    let logOutput: string;
    try {
        logOutput = execSync(
            `git log --format='COMMIT%x09%ae%x09%aI%x09%h%x09%s%x09%an%x09%ar' --name-only -- ${dirs.join(' ')}`,
            { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, cwd: repoRoot },
        );
    } catch {
        console.warn('Warning: git log failed, skipping git activity.');
        return;
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const commitCounts = new Map<string, number>();
    const authorSets = new Map<string, Set<string>>();
    const churnCounts = new Map<string, number>();
    const recentCommitsMap = new Map<string, RecentCommit[]>();

    let currentAuthor = '';
    let currentDate = '';
    let currentHash = '';
    let currentMessage = '';
    let currentAuthorName = '';
    let currentRelDate = '';

    for (const line of logOutput.split('\n')) {
        if (line.startsWith('COMMIT\t')) {
            const parts = line.split('\t');
            currentAuthor = parts[1] || '';
            currentDate = parts[2] || '';
            currentHash = parts[3] || '';
            currentMessage = parts[4] || '';
            currentAuthorName = parts[5] || '';
            currentRelDate = parts[6] || '';
        } else if (line.trim() && !line.startsWith('COMMIT')) {
            const file = line.trim();
            if (!relPathToNode.has(file)) continue;

            commitCounts.set(file, (commitCounts.get(file) || 0) + 1);

            if (!authorSets.has(file)) authorSets.set(file, new Set());
            authorSets.get(file)!.add(currentAuthor);

            if (currentDate && new Date(currentDate) >= sixMonthsAgo) {
                churnCounts.set(file, (churnCounts.get(file) || 0) + 1);
            }

            if (currentHash) {
                const rc = recentCommitsMap.get(file) || [];
                if (rc.length < 3) {
                    rc.push({
                        hash: currentHash,
                        message: currentMessage,
                        author: currentAuthorName,
                        relativeDate: currentRelDate,
                    });
                    recentCommitsMap.set(file, rc);
                }
            }
        }
    }

    for (const [relPath, node] of relPathToNode) {
        const commits = commitCounts.get(relPath) || 0;
        const authors = authorSets.get(relPath)?.size || 0;
        const churn = churnCounts.get(relPath) || 0;
        const recentCommits = recentCommitsMap.get(relPath) || [];
        if (commits > 0) {
            node.gitActivity = { commits, authors, churn, recentCommits };
        }
    }
}
