import * as yaml from 'js-yaml';
import { toCanonicalContentAsCodeSnapshot } from './contentAsCodeHash';

export const dumpCanonicalContentAsCodeYaml = (document: unknown): string =>
    yaml.dump(toCanonicalContentAsCodeSnapshot(document), {
        quotingType: '"',
        sortKeys: true,
    });
