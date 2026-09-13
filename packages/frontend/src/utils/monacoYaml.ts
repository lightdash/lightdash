import { configureMonacoYaml, type MonacoYamlOptions } from 'monaco-yaml';
import type { Monaco } from '../components/MonacoEditor';

/**
 * monaco-yaml only allows a single configured instance per `monaco` module
 * ("There may only be one configured instance of monaco-yaml at a time.").
 * Every YAML editor in the app (source code editor, learn sandbox, ...)
 * must therefore share one registration instead of each holding its own
 * module-level singleton — the second editor to mount would otherwise call
 * `configureMonacoYaml` again on the same global `monaco`, clobbering the
 * first. The first call here registers it; every later call re-applies the
 * caller's options via `.update`.
 */
let yamlConfiguration: ReturnType<typeof configureMonacoYaml> | undefined;

export const configureLightdashYaml = (
    monaco: Monaco,
    options: MonacoYamlOptions,
) => {
    if (yamlConfiguration) {
        void yamlConfiguration.update(options);
    } else {
        yamlConfiguration = configureMonacoYaml(monaco, options);
    }
};
