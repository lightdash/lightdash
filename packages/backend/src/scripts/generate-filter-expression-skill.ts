import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { FILTER_EXPRESSION_SKILL } from '../ee/services/ai/skills/filterExpressionSkill';

const generate = async () => {
    const directory = path.join(
        __dirname,
        '../ee/services/ai/skills/builtInSkills/filter-expressions',
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), FILTER_EXPRESSION_SKILL);
};

void generate().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
