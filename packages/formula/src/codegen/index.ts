import type { CompileOptions } from '../types';
import { DIALECTS } from './dialects';
import { SqlGenerator } from './generator';

export function createGenerator(options: CompileOptions): SqlGenerator {
    return new SqlGenerator(options, DIALECTS[options.dialect]);
}

export { SqlGenerator } from './generator';
