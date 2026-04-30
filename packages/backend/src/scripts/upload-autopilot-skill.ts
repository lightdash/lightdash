import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Args = {
    displayTitle: string;
    skillDir: string;
    skillId?: string;
};

const usage = `Upload the Autopilot "Developing in Lightdash" skill to Anthropic.

Creates a new skill by default. To upload a new version for an existing skill,
pass --skill-id or set SKILL_ID.

Usage:
  scripts/upload-autopilot-skill
  scripts/upload-autopilot-skill --skill-id skill_...

Options:
  --skill-id         Existing skill ID for version upload.
  --skill-dir        Skill directory. Default: skills/developing-in-lightdash
  --display-title    Skill title. Default: Developing in Lightdash

Env:
  ANTHROPIC_API_KEY  Anthropic API key.
  SKILL_ID           Existing skill ID for version upload.
  SKILL_DIR          Skill directory.
  DISPLAY_TITLE      Skill title.
`;

const repoRoot = path.resolve(__dirname, '../../../..');

const resolveFromRepoRoot = (inputPath: string) =>
    path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);

const parseArgs = (): Args => {
    const args = process.argv.slice(2);
    const parsed: Args = {
        displayTitle: process.env.DISPLAY_TITLE ?? 'Developing in Lightdash',
        skillDir: process.env.SKILL_DIR ?? 'skills/developing-in-lightdash',
        skillId: process.env.SKILL_ID,
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        switch (arg) {
            case '--skill-id':
                parsed.skillId = args[(i += 1)];
                break;
            case '--skill-dir':
                parsed.skillDir = args[(i += 1)];
                break;
            case '--display-title':
                parsed.displayTitle = args[(i += 1)];
                break;
            case '-h':
            case '--help':
                console.log(usage);
                process.exit(0);
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return parsed;
};

const listFiles = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) return listFiles(fullPath);
            if (entry.isFile()) return [fullPath];
            return [];
        }),
    );
    return files.flat().sort();
};

const main = async () => {
    const { displayTitle, skillDir, skillId } = parseArgs();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

    const resolvedSkillDir = resolveFromRepoRoot(skillDir);
    const skillMd = path.join(resolvedSkillDir, 'SKILL.md');

    try {
        const skillMdStat = await stat(skillMd);
        if (!skillMdStat.isFile()) throw new Error();
    } catch {
        throw new Error(`${skillMd} not found`);
    }

    const skillParent = path.dirname(resolvedSkillDir);
    const skillTopLevel = path.basename(resolvedSkillDir);
    const filePaths = await listFiles(resolvedSkillDir);
    const files = await Promise.all(
        filePaths.map(async (filePath) => {
            const uploadName =
                skillParent === '.'
                    ? filePath
                    : path.relative(skillParent, filePath);

            if (
                uploadName !== `${skillTopLevel}/SKILL.md` &&
                !uploadName.startsWith(`${skillTopLevel}/`)
            ) {
                throw new Error(
                    `Computed upload filename is outside ${skillTopLevel}/: ${uploadName}`,
                );
            }

            return toFile(await readFile(filePath), uploadName);
        }),
    );

    const client = new Anthropic({ apiKey });

    if (skillId) {
        console.log(`Creating new version for skill: ${skillId}`);
        console.log(`Uploading ${files.length} files from ${resolvedSkillDir}`);

        const version = await client.beta.skills.versions.create(skillId, {
            files,
        });
        console.log(JSON.stringify(version, null, 2));
        console.log('\nUpload complete');
        console.log(`  Skill ID: ${version.skill_id}`);
        console.log(`  Version: ${version.version}`);
        return;
    }

    console.log(`Creating skill: ${displayTitle}`);
    console.log(`Uploading ${files.length} files from ${resolvedSkillDir}`);

    const skill = await client.beta.skills.create({
        display_title: displayTitle,
        files,
    });
    console.log(JSON.stringify(skill, null, 2));
    console.log('\nUpload complete');
    console.log(`  Skill ID: ${skill.id}`);
    if (skill.latest_version) {
        console.log(`  Version: ${skill.latest_version}`);
    }
};

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
});
