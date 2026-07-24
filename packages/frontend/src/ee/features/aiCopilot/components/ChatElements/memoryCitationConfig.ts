import type { StreamdownProps } from 'streamdown';
import { MemoryCitation } from './MemoryCitation';

type StreamdownComponents = NonNullable<StreamdownProps['components']>;

export const MEMORY_CITATION_ALLOWED_TAGS = {
    'ld-mem-cite': ['id', 'data-memory-index'],
};

export const MEMORY_CITATION_COMPONENTS: StreamdownComponents = {
    'ld-mem-cite': MemoryCitation as StreamdownComponents[string],
};
