import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConcepts } from './lib';
import { CONCEPT_MANIFEST } from './manifest';
const main = () => {
    const root = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../..',
    );
    const docs = process.env.LIGHTDASH_DOCS_DIR;
    if (!docs)
        throw new Error(
            'Set LIGHTDASH_DOCS_DIR to the canonical mintlify-docs checkout',
        );
    const target = path.join(
        root,
        'packages/frontend/src/features/learn/conceptLessons.generated.ts',
    );
    const source = `// Generated from canonical documentation. Run scope-tours/concepts/generate.ts.\nimport type { ConceptLesson } from './conceptLesson';\nexport const CONCEPT_LESSONS: Record<string, ConceptLesson> = ${JSON.stringify(buildConcepts(docs, CONCEPT_MANIFEST), null, 4)};\n`;
    const formatted = execFileSync(
        'pnpm',
        ['-F', 'frontend', 'exec', 'oxfmt', '--stdin-filepath', target],
        { cwd: root, input: source, encoding: 'utf8' },
    );
    if (process.argv.includes('--check')) {
        if (readFileSync(target, 'utf8') !== formatted)
            throw new Error(
                'Concept lessons are stale; regenerate from canonical docs',
            );
    } else writeFileSync(target, formatted);
};
void main();
