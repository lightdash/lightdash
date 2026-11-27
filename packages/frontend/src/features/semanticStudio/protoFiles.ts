import { useMemo } from 'react';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import { countFieldLines, findFieldBlock } from './modelCode';
import { modelNameOfSourcePath, useStudioSources } from './useStudioSources';

const isYaml = (path: string) => /\.ya?ml$/.test(path);

/** A dbt model's files in the repository, YAML first: where the compiled model says they are, or by its name where it does not say. */
export const useModelFiles = (
    projectUuid: string,
    modelName: string | null,
): string[] => {
    const { data: sources } = useStudioSources(projectUuid, null, null);
    const { data: explore, isInitialLoading } = useExploreByProjectUuid(
        modelName ?? undefined,
        projectUuid,
    );
    return useMemo(() => {
        const files = sources?.files ?? [];
        // Nothing until the model says where its files are: a guess by name would open the wrong one first
        if (modelName === null || isInitialLoading) return [];
        // The compiled paths start at different folders, so a file is the one that ends with them
        const at = (path: string | undefined) =>
            path === undefined
                ? undefined
                : files.find(
                      (file) => file === path || file.endsWith(`/${path}`),
                  );
        const named = files.filter(
            (file) => modelNameOfSourcePath(file) === modelName,
        );
        const yml = at(explore?.ymlPath) ?? named.find(isYaml);
        const sql = at(explore?.sqlPath) ?? named.find((file) => !isYaml(file));
        return [yml, sql].filter((file) => file !== undefined);
    }, [sources, explore, modelName, isInitialLoading]);
};

const indentOf = (line: string) => line.length - line.trimStart().length;

/** The lines of one model inside a YAML file that may define several: its `- name:` line to the next entry at its level, or the whole file. */
const modelRange = (lines: string[], modelName: string) => {
    const names = new Set(
        [modelName, `"${modelName}"`, `'${modelName}'`].map(
            (name) => `- name: ${name}`,
        ),
    );
    const starts = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => names.has(line.trim()));
    if (starts.length === 0) return { start: 0, end: lines.length };
    // Its own entry is the least indented one; a column of the same name sits deeper
    const { line, index: start } = starts.reduce((best, entry) =>
        indentOf(entry.line) < indentOf(best.line) ? entry : best,
    );
    const next = lines.findIndex(
        (other, index) =>
            index > start &&
            other.trim() !== '' &&
            indentOf(other) <= indentOf(line),
    );
    return { start: start + 1, end: next === -1 ? lines.length : next };
};

/** A field's lines within its own model, as 1-based lines of the whole file, and how many definitions carry its name there. */
export const findModelField = (
    content: string,
    modelName: string,
    fieldName: string,
): { start: number; end: number; count: number } | null => {
    const lines = content.split('\n');
    const range = modelRange(lines, modelName);
    const scoped = lines.slice(range.start, range.end).join('\n');
    const block = findFieldBlock(scoped, fieldName);
    return block === null
        ? null
        : {
              start: block.start + range.start,
              end: block.end + range.start,
              count: countFieldLines(scoped, fieldName),
          };
};
