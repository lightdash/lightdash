import * as fs from 'fs';
import fetch from 'node-fetch';
import * as os from 'os';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { CLI_VERSION } from '../env';
import GlobalState from '../globalState';
import * as styles from '../styles';

const SKILL_MANIFEST_FILENAME = '.lightdash-skill-manifest.json';

const DEFAULT_SOURCE_REPO = 'lightdash/lightdash';

function getGitHubApiBase(repo: string): string {
    return `https://api.github.com/repos/${repo}/contents`;
}

function getGitHubRawBase(repo: string): string {
    return `https://raw.githubusercontent.com/${repo}/${CLI_VERSION}`;
}

type AgentType = 'claude' | 'cursor' | 'codex' | 'cortex';

type InstallSkillsOptions = {
    verbose: boolean;
    agent: AgentType;
    global: boolean;
    path?: string;
    source?: string;
};

type SkillManifest = {
    version: string;
    installed_at: string;
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

function getAgentSkillsDir(agent: AgentType, isGlobal: boolean = false): string {
    switch (agent) {
        case 'claude':
            return '.claude/skills';
        case 'cursor':
            return '.cursor/skills';
        case 'codex':
            return '.codex/skills';
        case 'cortex':
            return isGlobal ? '.snowflake/cortex/skills' : '.cortex/skills';
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
    const isGlobal = options.global && !options.path;
    const skillsDir = getAgentSkillsDir(options.agent, isGlobal);

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
    repo: string,
): Promise<GitHubContentItem[]> {
    const url = `${getGitHubApiBase(repo)}/${repoPath}?ref=${CLI_VERSION}`;
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

function interpolateVersionPlaceholders(content: string): string {
    return content.replace(/\{\{CLI_VERSION\}\}/g, CLI_VERSION);
}

/* eslint-disable no-await-in-loop */
// Sequential downloads are intentional to avoid GitHub rate limits and handle symlinks
async function downloadSkillFiles(
    repoPath: string,
    localDir: string,
    repo: string,
    visited = new Set<string>(),
): Promise<void> {
    // Prevent infinite loops with symlinks
    if (visited.has(repoPath)) {
        GlobalState.debug(`> Skipping already visited path: ${repoPath}`);
        return;
    }
    visited.add(repoPath);

    const items = await fetchGitHubDirectory(repoPath, repo);

    for (const item of items) {
        const localPath = path.join(localDir, item.name);

        if (item.type === 'dir') {
            fs.mkdirSync(localPath, { recursive: true });
            await downloadSkillFiles(item.path, localPath, repo, visited);
        } else if (item.type === 'symlink' && item.target) {
            // Resolve the symlink and fetch the actual content
            const resolvedPath = resolveSymlinkTarget(item.path, item.target);
            GlobalState.debug(
                `> Resolving symlink: ${item.path} -> ${resolvedPath}`,
            );

            // Check if the target is a directory or file by fetching it
            try {
                const targetItems = await fetchGitHubDirectory(
                    resolvedPath,
                    repo,
                );
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
                            repo,
                            visited,
                        );
                    } else if (targetItem.download_url) {
                        const content = await fetchFileContent(
                            targetItem.download_url,
                        );
                        fs.writeFileSync(
                            targetLocalPath,
                            interpolateVersionPlaceholders(content),
                        );
                    }
                }
            } catch {
                // It's a file, fetch its content directly
                const downloadUrl = `${getGitHubRawBase(repo)}/${resolvedPath}`;
                const content = await fetchFileContent(downloadUrl);
                // Ensure parent directory exists
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(
                    localPath,
                    interpolateVersionPlaceholders(content),
                );
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
                    `${getGitHubRawBase(repo)}/${resolvedPath}`,
                );
            }

            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(
                localPath,
                interpolateVersionPlaceholders(content),
            );
        }
    }
}
/* eslint-enable no-await-in-loop */

async function listAvailableSkills(repo: string): Promise<string[]> {
    const items = await fetchGitHubDirectory('skills', repo);
    return items.filter((item) => item.type === 'dir').map((item) => item.name);
}

function writeSkillManifest(skillDir: string): void {
    const manifest: SkillManifest = {
        version: CLI_VERSION,
        installed_at: new Date().toISOString(),
    };
    fs.writeFileSync(
        path.join(skillDir, SKILL_MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2),
    );
}

function readSkillManifest(skillDir: string): SkillManifest | null {
    const manifestPath = path.join(skillDir, SKILL_MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) {
        return null;
    }
    try {
        return JSON.parse(
            fs.readFileSync(manifestPath, 'utf8'),
        ) as SkillManifest;
    } catch {
        return null;
    }
}

type InstalledSkillInfo = {
    name: string;
    version: string;
    agent: AgentType;
    scope: 'global' | 'project';
    isOutdated: boolean;
};

function findInstalledSkills(): InstalledSkillInfo[] {
    const agents: AgentType[] = ['claude', 'cursor', 'codex', 'cortex'];
    const results: InstalledSkillInfo[] = [];

    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    const projectRoot = gitRoot || cwd;

    for (const agent of agents) {
        // Check global installation
        const globalSkillsDir = path.join(
            os.homedir(),
            getAgentSkillsDir(agent, true),
        );
        if (fs.existsSync(globalSkillsDir)) {
            try {
                const entries = fs.readdirSync(globalSkillsDir);
                entries
                    .filter((e) =>
                        fs.statSync(path.join(globalSkillsDir, e)).isDirectory(),
                    )
                    .forEach((entry) => {
                        const manifest = readSkillManifest(
                            path.join(globalSkillsDir, entry),
                        );
                        if (manifest) {
                            results.push({
                                name: entry,
                                version: manifest.version,
                                agent,
                                scope: 'global',
                                isOutdated: manifest.version !== CLI_VERSION,
                            });
                        }
                    });
            } catch {
                // Ignore read errors
            }
        }

        // Check project installation
        const projectSkillsDir = path.join(
            projectRoot,
            getAgentSkillsDir(agent, false),
        );
        if (fs.existsSync(projectSkillsDir)) {
            try {
                const entries = fs.readdirSync(projectSkillsDir);
                entries
                    .filter((e) =>
                        fs.statSync(path.join(projectSkillsDir, e)).isDirectory(),
                    )
                    .forEach((entry) => {
                        const manifest = readSkillManifest(
                            path.join(projectSkillsDir, entry),
                        );
                        if (manifest) {
                            results.push({
                                name: entry,
                                version: manifest.version,
                                agent,
                                scope: 'project',
                                isOutdated: manifest.version !== CLI_VERSION,
                            });
                        }
                    });
            } catch {
                // Ignore read errors
            }
        }
    }

    return results;
}

export function getVersionWithSkills(): string {
    const lines = [CLI_VERSION];
    const skills = findInstalledSkills();

    if (skills.length > 0) {
        lines.push('');
        lines.push('Installed skills:');
        for (const skill of skills) {
            const line = `  ${skill.name} v${skill.version} [${skill.agent}, ${skill.scope}]`;
            lines.push(skill.isOutdated ? styles.warning(line) : line);
        }

        const outdated = skills.filter((s) => s.isOutdated);
        if (outdated.length > 0) {
            lines.push('');
            lines.push(styles.warning('Update with:'));
            const seen = new Set<string>();
            for (const skill of outdated) {
                const globalFlag = skill.scope === 'global' ? ' --global' : '';
                const agentFlag = ` --agent ${skill.agent}`;
                const cmd = `lightdash install-skills${globalFlag}${agentFlag}`;
                if (!seen.has(cmd)) {
                    seen.add(cmd);
                    lines.push(styles.warning(`  ${cmd}`));
                }
            }
        }
    }

    return lines.join('\n');
}

export const installSkillsHandler = async (
    options: InstallSkillsOptions,
): Promise<void> => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(options.verbose);

    const installPath = getInstallPath(options);
    const sourceRepo = options.source ?? DEFAULT_SOURCE_REPO;

    console.error(styles.title('\n⚡ Lightdash Skills Installer\n'));
    console.error(`Agent: ${styles.bold(options.agent)}`);
    console.error(
        `Scope: ${styles.bold(options.global ? 'global' : 'project')}`,
    );
    console.error(`Version: ${styles.bold(CLI_VERSION)}`);
    if (sourceRepo !== DEFAULT_SOURCE_REPO) {
        console.error(`Source: ${styles.bold(sourceRepo)}`);
    }
    console.error(`Install path: ${styles.bold(installPath)}\n`);

    const spinner = GlobalState.startSpinner('Fetching available skills...');

    try {
        const skills = await listAvailableSkills(sourceRepo);

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
                await downloadSkillFiles(
                    `skills/${skill}`,
                    skillLocalPath,
                    sourceRepo,
                );
                writeSkillManifest(skillLocalPath);
                skillSpinner.succeed(
                    `Installed skill: ${skill} (v${CLI_VERSION})`,
                );
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
