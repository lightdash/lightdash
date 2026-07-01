import { type DataAppCodeFile } from '@lightdash/common';
import { existsSync, readdirSync, readFileSync } from 'fs';
import * as path from 'path';

// Resolves vendor directory paths: built → dist/vendor, source → sandboxes/data-apps/template + src/authoring

const builtVendorDir = path.join(__dirname, '..', '..', 'vendor');

function resolveVendorDirs(): { templateDir: string; authoringDir: string } {
    if (existsSync(builtVendorDir)) {
        return {
            templateDir: path.join(builtVendorDir, 'template'),
            authoringDir: path.join(builtVendorDir, 'authoring'),
        };
    }
    return {
        templateDir: path.resolve(
            __dirname,
            '..',
            '..',
            '..',
            '..',
            '..',
            'sandboxes',
            'data-apps',
            'template',
        ),
        authoringDir: path.join(__dirname, 'authoring'),
    };
}

// --- Internal helpers ---

const toFile = (relPath: string, buf: Buffer): DataAppCodeFile => ({
    path: relPath.split(path.sep).join('/'),
    contentBase64: buf.toString('base64'),
});

/**
 * Recursively walks a directory, skipping any top-level entry whose name is in
 * `skipTopLevel`. Returns a flat list of DataAppCodeFile.
 */
function walkDir(
    dir: string,
    baseDir: string,
    skipTopLevel: ReadonlySet<string>,
): DataAppCodeFile[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const entryPath = path.join(dir, entry.name);
        const relFromBase = path.relative(baseDir, entryPath);
        const topSegment = relFromBase.split(path.sep)[0];
        if (skipTopLevel.has(topSegment)) return [];
        if (entry.isDirectory())
            return walkDir(entryPath, baseDir, skipTopLevel);
        return [toFile(relFromBase, readFileSync(entryPath))];
    });
}

// --- Public API ---

/**
 * Replaces every `"workspace:*"` / `"workspace:^"` / `"workspace:~…"` version
 * string in a serialised package.json with a concrete semver `version`.
 */
export const rewriteWorkspaceDeps = (
    packageJson: string,
    version: string,
): string => packageJson.replace(/"workspace:[^"]*"/g, `"${version}"`);

/**
 * Reads vendored template, excluding sandbox-only entries (skill.md, scripts/, src/).
 */
export const loadVendoredTemplate = (): DataAppCodeFile[] => {
    const { templateDir } = resolveVendorDirs();
    const SKIP = new Set(['skill.md', 'scripts', 'src']);
    return walkDir(templateDir, templateDir, SKIP);
};

/**
 * Assembles static authoring files (configs, skills, templates) to deploy alongside a data app.
 */
export const buildStaticAuthoringFiles = (args: {
    appName: string;
    sdkVersion: string;
}): DataAppCodeFile[] => {
    const { appName, sdkVersion } = args;
    const { templateDir, authoringDir } = resolveVendorDirs();

    const files: DataAppCodeFile[] = [];

    // 1. Template scaffold files (src/, scripts/, skill.md excluded)
    for (const file of loadVendoredTemplate()) {
        if (file.path === 'package.json') {
            const rewritten = rewriteWorkspaceDeps(
                Buffer.from(file.contentBase64, 'base64').toString('utf-8'),
                sdkVersion,
            );
            files.push({
                path: 'package.json',
                contentBase64: Buffer.from(rewritten).toString('base64'),
            });
        } else {
            files.push(file);
        }
    }

    // 2. skill.md → .claude/skills/lightdash-data-app/SKILL.md
    files.push({
        path: '.claude/skills/lightdash-data-app/SKILL.md',
        contentBase64: readFileSync(
            path.join(templateDir, 'skill.md'),
        ).toString('base64'),
    });

    // 3. authoring/developing-data-apps-locally/SKILL.md
    //    → .claude/skills/developing-data-apps-locally/SKILL.md
    files.push({
        path: '.claude/skills/developing-data-apps-locally/SKILL.md',
        contentBase64: readFileSync(
            path.join(authoringDir, 'developing-data-apps-locally', 'SKILL.md'),
        ).toString('base64'),
    });

    // 4. AGENTS.md.tmpl → AGENTS.md
    files.push({
        path: 'AGENTS.md',
        contentBase64: readFileSync(
            path.join(authoringDir, 'AGENTS.md.tmpl'),
        ).toString('base64'),
    });

    // 5. README.md.tmpl → README.md  (substitute {{APP_NAME}})
    const readme = readFileSync(
        path.join(authoringDir, 'README.md.tmpl'),
        'utf-8',
    ).replace(/\{\{APP_NAME\}\}/g, appName);
    files.push({
        path: 'README.md',
        contentBase64: Buffer.from(readme).toString('base64'),
    });

    // 6. gitignore → .gitignore
    files.push({
        path: '.gitignore',
        contentBase64: readFileSync(
            path.join(authoringDir, 'gitignore'),
        ).toString('base64'),
    });

    return files;
};
