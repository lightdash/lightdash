import type { StreamdownProps } from 'streamdown';
import { Citation } from './Citation';
import { MemoryCitation } from './MemoryCitation';

type StreamdownComponents = NonNullable<StreamdownProps['components']>;

const CITATION_ATTRIBUTES = ['id', 'source', 'data-citation-index'];

export const CITATION_ALLOWED_TAGS = {
    'ld-cite': CITATION_ATTRIBUTES,
    // Legacy tag: persisted messages are immutable, so it renders forever.
    'ld-mem-cite': CITATION_ATTRIBUTES,
};

export const CITATION_COMPONENTS: StreamdownComponents = {
    'ld-cite': Citation as StreamdownComponents[string],
    'ld-mem-cite': MemoryCitation as StreamdownComponents[string],
};
