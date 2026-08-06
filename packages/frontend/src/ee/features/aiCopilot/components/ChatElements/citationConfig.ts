import type { StreamdownProps } from 'streamdown';
import { MemoryCitation } from './MemoryCitation';
import { ProjectContextCitation } from './ProjectContextCitation';

type StreamdownComponents = NonNullable<StreamdownProps['components']>;

export const CITATION_ALLOWED_TAGS = {
    'ld-mem-cite': ['id', 'data-citation-index'],
    'ld-ctx-cite': ['id', 'data-citation-index'],
};

export const CITATION_COMPONENTS: StreamdownComponents = {
    'ld-mem-cite': MemoryCitation as StreamdownComponents[string],
    'ld-ctx-cite': ProjectContextCitation as StreamdownComponents[string],
};
