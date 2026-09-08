# Native Lightdash Git projects

Native YAML and dbt share GitHub authentication, repository, branch and project
subdirectory settings. The semantic format is a separate build choice: native
Lightdash YAML does not use dbt profiles, targets, selectors, dependencies or a
dbt installation. Existing connections default to dbt. GitLab support is deferred.

`lightdash.config.yml` owns semantic configuration. The CLI uses its warehouse
type to compile SQL; server builds use the project's existing warehouse
connection. Connecting a repository to a CLI-created project must preserve its
UUID, warehouse credentials and saved content.

The shared Node loader uses `models/` when present, otherwise
`lightdash/models/`, recursively accepting `.yml` and `.yaml` models with
`type: model`, `model/v1beta` or `model/v1`. Files with other resource types are
ignored. Invalid YAML, invalid models and duplicate model names fail loading
instead of silently publishing an incomplete project.

Loaded models retain paths relative to the project directory. The shared
compiler carries those paths into compiled tables; Git operations prepend the
configured project subdirectory exactly once to address repository files. A
model named `orders` in `models/sales/daily.yaml` must write back to that file.

Native models still compile through the existing internal model-node conversion
and explore compiler. This preserves one semantic compiler without introducing
a general source-adapter framework. The Node filesystem loader is a separate
`@lightdash/common/lightdash/loader` entry point, outside the browser barrel.
