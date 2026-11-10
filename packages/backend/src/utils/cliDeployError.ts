import { ConflictError } from '@lightdash/common';

const defaultAdvice =
    'To fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.';

export const cliDeployConflictError = (
    reason: string,
    sourceNames: readonly string[],
    advice: string = defaultAdvice,
): ConflictError =>
    new ConflictError(`This deploy was not saved and nothing in the project changed.
The project has several dbt sources and Lightdash could not tell which one these explores belong to: ${reason}.

${advice}

Sources in this project: ${sourceNames.join(', ')}.`);

export const cliDeployCollisionReason = (
    collisions: { exploreName: string; sourceName: string }[],
): string =>
    `the upload would replace explores owned by another source: ${collisions
        .sort((a, b) => a.exploreName.localeCompare(b.exploreName))
        .map(
            ({ exploreName, sourceName }) =>
                `${exploreName} (source ${sourceName})`,
        )
        .join(', ')}`;
