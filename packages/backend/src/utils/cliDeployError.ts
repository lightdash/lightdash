import { ConflictError } from '@lightdash/common';

export const cliDeployConflictError = (
    reason: string,
    sourceNames: readonly string[],
): ConflictError =>
    new ConflictError(`This deploy was not saved and nothing in the project changed.
The project has several dbt sources and Lightdash could not tell which one these explores belong to: ${reason}.

To fix it, name the source for this deploy:
  lightdash deploy --source <name>
or store it once for this project:
  lightdash config set-source <name>

Sources in this project: ${sourceNames.join(', ')}.
If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.`);
