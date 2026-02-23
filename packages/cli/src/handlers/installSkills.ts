import * as fs from 'fs';
import fetch from 'node-fetch';
import * as os from 'os';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import GlobalState from '../globalState';
import * as styles from '../styles';

const GITHUB_API_BASE =
    'https://api.github.com/repos/lightdash/lightdash/contents';
const GITHUB_RAW_BASE =
    'https://raw.githubusercontent.com/lightdash/lightdash/main';

type AgentType = 'claude' | 'cursor' | 'codex';

type InstallSkillsOptions = {
    verbose: boolean;
    agent: AgentType;
    global: boolean;
    path?: string;
};

type GitHubContentItem = {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink';
    target?: string; // For symlinks
    download_url: string | null;
    sha: string;
    size: number;
};

function getAgentSkillsDir(agent: AgentType): string {
    switch (agent) {
        case 'claude':
            return '.claude/skills';
        case 'cursor':
            return '.cursor/skills';
        case 'codex':
            return '.codex/skills';
        default:
            throw new Error(`Unknown agent type: ${agent}`);
    }
}

function findGitRoot(startDir: string): string | null {
    let currentDir = startDir;
    while (currentDir !== path.parse(currentDir).root) {
        if (fs.existsSync(path.join(currentDir, '.git'))) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }
    // Check root directory
    if (fs.existsSync(path.join(currentDir, '.git'))) {
        return currentDir;
    }
    return null;
}

function getInstallPath(options: InstallSkillsOptions): string {
    const skillsDir = getAgentSkillsDir(options.agent);

    // If explicit path provided, use it
    if (options.path) {
        return path.join(options.path, skillsDir);
    }

    // If global, use home directory
    if (options.global) {
        return path.join(os.homedir(), skillsDir);
    }

    // Project install: find git root
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);

    if (gitRoot) {
        GlobalState.debug(`> Found git root at: ${gitRoot}`);
        return path.join(gitRoot, skillsDir);
    }

    // No git root found, use current directory
    GlobalState.debug(`> No git root found, using current directory: ${cwd}`);
    return path.join(cwd, skillsDir);
}

async function fetchGitHubDirectory(
    repoPath: string,
): Promise<GitHubContentItem[]> {
    const url = `${GITHUB_API_BASE}/${repoPath}`;
    GlobalState.debug(`> Fetching GitHub directory: ${url}`);

    const response = await fetch(url, {
        headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'lightdash-cli',
        },
    });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch GitHub directory: ${response.status} ${response.statusText}`,
        );
    }

    return response.json() as Promise<GitHubContentItem[]>;
}

async function fetchFileContent(downloadUrl: string): Promise<string> {
    GlobalState.debug(`> Fetching file: ${downloadUrl}`);

    const response = await fetch(downloadUrl, {
        headers: {
            'User-Agent': 'lightdash-cli',
        },
    });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch file: ${response.status} ${response.statusText}`,
        );
    }

    return response.text();
}

function resolveSymlinkTarget(symlinkPath: string, target: string): string {
    const symlinkDir = path.posix.dirname(symlinkPath);
    return path.posix.normalize(path.posix.join(symlinkDir, target.trim()));
}

/* eslint-disable no-await-in-loop */
// Sequential downloads are intentional to avoid GitHub rate limits and handle symlinks
async function downloadSkillFiles(
    repoPath: string,
    localDir: string,
    visited = new Set<string>(),
): Promise<void> {
    // Prevent infinite loops with symlinks
    if (visited.has(repoPath)) {
        GlobalState.debug(`> Skipping already visited path: ${repoPath}`);
        return;
    }
    visited.add(repoPath);

    const items = await fetchGitHubDirectory(repoPath);

    for (const item of items) {
        const localPath = path.join(localDir, item.name);

        if (item.type === 'dir') {
            fs.mkdirSync(localPath, { recursive: true });
            await downloadSkillFiles(item.path, localPath, visited);
        } else if (item.type === 'symlink' && item.target) {
            // Resolve the symlink and fetch the actual content
            const resolvedPath = resolveSymlinkTarget(item.path, item.target);
            GlobalState.debug(
                `> Resolving symlink: ${item.path} -> ${resolvedPath}`,
            );

            // Check if the target is a directory or file by fetching it
            try {
                const targetItems = await fetchGitHubDirectory(resolvedPath);
                // It's a directory, create it and download contents
                fs.mkdirSync(localPath, { recursive: true });
                for (const targetItem of targetItems) {
                    const targetLocalPath = path.join(
                        localPath,
                        targetItem.name,
                    );
                    if (targetItem.type === 'dir') {
                        fs.mkdirSync(targetLocalPath, { recursive: true });
                        await downloadSkillFiles(
                            targetItem.path,
                            targetLocalPath,
                            visited,
                        );
                    } else if (targetItem.download_url) {
                        const content = await fetchFileContent(
                            targetItem.download_url,
                        );
                        fs.writeFileSync(targetLocalPath, content);
                    }
                }
            } catch {
                // It's a file, fetch its content directly
                const downloadUrl = `${GITHUB_RAW_BASE}/${resolvedPath}`;
                const content = await fetchFileContent(downloadUrl);
                // Ensure parent directory exists
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(localPath, content);
            }
        } else if (item.type === 'file' && item.download_url) {
            let content = await fetchFileContent(item.download_url);

            // GitHub returns symlink content as the target path - resolve it
            if (content.startsWith('../') || content.startsWith('./')) {
                const resolvedPath = resolveSymlinkTarget(item.path, content);
                GlobalState.debug(
                    `> Resolving symlink: ${item.path} -> ${resolvedPath}`,
                );
                content = await fetchFileContent(
                    `${GITHUB_RAW_BASE}/${resolvedPath}`,
                );
            }

            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, content);
        }
    }
}
/* eslint-enable no-await-in-loop */

async function listAvailableSkills(): Promise<string[]> {
    const items = await fetchGitHubDirectory('skills');
    return items.filter((item) => item.type === 'dir').map((item) => item.name);
}

export const installSkillsHandler = async (
    options: InstallSkillsOptions,
): Promise<void> => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(options.verbose);

    const installPath = getInstallPath(options);

    console.error(styles.title('\n⚡ Lightdash Skills Installer\n'));
    console.error(`Agent: ${styles.bold(options.agent)}`);
    console.error(
        `Scope: ${styles.bold(options.global ? 'global' : 'project')}`,
    );
    console.error(`Install path: ${styles.bold(installPath)}\n`);

    const spinner = GlobalState.startSpinner('Fetching available skills...');

    try {
        const skills = await listAvailableSkills();

        if (skills.length === 0) {
            spinner.fail('No skills found in the repository');
            return;
        }

        spinner.text = `Found ${skills.length} skill(s): ${skills.join(', ')}`;
        spinner.succeed();

        // Create install directory
        fs.mkdirSync(installPath, { recursive: true });

        // Install skills sequentially to provide meaningful progress feedback
        /* eslint-disable no-await-in-loop */
        for (const skill of skills) {
            const skillSpinner = GlobalState.startSpinner(
                `Installing skill: ${skill}...`,
            );
            const skillLocalPath = path.join(installPath, skill);

            try {
                // Remove existing skill directory if it exists
                if (fs.existsSync(skillLocalPath)) {
                    fs.rmSync(skillLocalPath, { recursive: true, force: true });
                }

                fs.mkdirSync(skillLocalPath, { recursive: true });
                await downloadSkillFiles(`skills/${skill}`, skillLocalPath);
                skillSpinner.succeed(`Installed skill: ${skill}`);
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : String(err);
                skillSpinner.fail(
                    `Failed to install skill ${skill}: ${errorMessage}`,
                );
            }
        }
        /* eslint-enable no-await-in-loop */

        console.error(styles.success('\n✓ Skills installed successfully!\n'));
        console.error(`Skills are available at: ${styles.bold(installPath)}\n`);
    } catch (err) {
        success = false;
        const errorMessage = err instanceof Error ? err.message : String(err);
        spinner.fail(`Failed to fetch skills: ${errorMessage}`);
        throw err;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'install-skills',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};
