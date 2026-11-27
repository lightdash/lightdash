import { QUERY_PIPELINES_SKILL_NAME } from '@lightdash/common';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { QUERY_PIPELINES_SKILL } from '../ee/services/ai/skills/queryPipelinesSkill';

const generate = async () => {
    const directory = path.join(
        __dirname,
        '../ee/services/ai/skills/builtInSkills',
        QUERY_PIPELINES_SKILL_NAME,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), QUERY_PIPELINES_SKILL);
};

void generate().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
