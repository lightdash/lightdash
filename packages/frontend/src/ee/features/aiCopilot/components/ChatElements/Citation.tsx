import { assertUnreachable, isAgentCitationSource } from '@lightdash/common';
import styles from './Citation.module.css';
import { MemoryCitation } from './MemoryCitation';
import { ProjectContextCitation } from './ProjectContextCitation';

type CitationProps = {
    // Straight off the marker's HTML attributes, so untrusted: the model can
    // emit any string, or omit it.
    source?: string;
    id?: string;
    'data-citation-index'?: number | string;
};

/**
 * Routes a `<ld-cite>` marker to its tier's renderer. A marker naming no known
 * source is malformed — the backend already declined to count it — so it
 * renders inert rather than posing as a citation of either tier.
 */
export const Citation = ({ source, ...props }: CitationProps) => {
    if (!isAgentCitationSource(source)) {
        return <span className={styles.marker} aria-hidden="true" />;
    }

    switch (source) {
        case 'context':
            return <ProjectContextCitation {...props} />;
        case 'memory':
            return <MemoryCitation {...props} />;
        default:
            return assertUnreachable(source, 'Unknown agent citation source');
    }
};
