import { promises as fs } from 'fs';
import path from 'path';

const sourceRoot = __dirname;
const sources = async () => {
    const entries = await fs.readdir(sourceRoot, {
        recursive: true,
        withFileTypes: true,
    });
    return Promise.all(
        entries
            .filter(
                (entry) =>
                    entry.isFile() &&
                    entry.name.endsWith('.ts') &&
                    !entry.name.endsWith('.test.ts') &&
                    !entry.name.endsWith('.d.ts') &&
                    !entry.name.endsWith('.mocks.ts'),
            )
            .map(async (entry) => {
                const file = path.join(entry.parentPath, entry.name);
                return {
                    name: path.relative(sourceRoot, file),
                    text: await fs.readFile(file, 'utf8'),
                };
            }),
    );
};
it('keeps the child launcher inventory explicit', async () => {
    expect(
        (await sources())
            .filter(({ text }) =>
                /from ['"](?:execa|(?:node:)?child_process)['"]/.test(text),
            )
            .map(({ name }) => name)
            .sort(),
    ).toEqual([
        'dbt/models.ts',
        'handlers/apps/createApp.ts',
        'handlers/apps/preview.ts',
        'handlers/apps/validate.ts',
        'handlers/dbt/compile.ts',
        'handlers/dbt/getDbtProfileTargetName.ts',
        'handlers/dbt/getDbtVersion.ts',
        'handlers/dbt/getWarehouseClient.ts',
        'handlers/dbt/run.ts',
        'handlers/diagnostics.ts',
        'handlers/login/connectionBrowser.ts',
        'handlers/login/oauth.ts',
    ]);
});
it('keeps whole config and credential serializers in the audited inventory', async () => {
    expect(
        (await sources())
            .filter(({ text }) =>
                /JSON\.stringify\(\s*(?:config|context|headers|credentials?|tokens?)\b/.test(
                    text,
                ),
            )
            .map(({ name }) => name)
            .sort(),
    ).toEqual(['handlers/dbt/getWarehouseClient.ts']);
});
it.each([
    'handlers/apps/createApp.ts',
    'handlers/apps/preview.ts',
    'handlers/diagnostics.ts',
])(
    'preserves ordinary launch statements in the refused command %s',
    async (file) => {
        const current = await fs.readFile(path.join(sourceRoot, file), 'utf8');
        const launches = (source: string) => {
            const calls: string[] = [];
            const expression = /\bexeca\(/g;
            for (const match of source.matchAll(expression)) {
                let depth = 1;
                let end = match.index + match[0].length;
                let quote: string | null = null;
                let escaped = false;
                for (; depth > 0 && end < source.length; end += 1) {
                    const character = source[end];
                    if (quote !== null) {
                        if (escaped) escaped = false;
                        else if (character === '\\') escaped = true;
                        else if (character === quote) quote = null;
                    } else if (['"', "'", '`'].includes(character))
                        quote = character;
                    else if (character === '(') depth += 1;
                    else if (character === ')') depth -= 1;
                }
                calls.push(source.slice(match.index, end));
            }
            return calls;
        };
        expect(launches(current).length).toBeGreaterThan(0);
        expect(launches(current)).toMatchSnapshot();
    },
);
