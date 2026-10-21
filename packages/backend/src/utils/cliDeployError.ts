import { ConflictError } from '@lightdash/common';

export const cliDeployConflictError = (
    reason: string,
    sourceNames: readonly string[],
): ConflictError =>
    new ConflictError(`This deploy was not saved and nothing in the project changed.
The project has several dbt sources and Lightdash could not tell which one these explores belong to: ${reason}.

To fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.

Sources in this project: ${sourceNames.join(', ')}.`);
