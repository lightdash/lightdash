import { type AiPromptContextItem } from '@lightdash/common';
import { ContentReferenceLink } from './ContentReferenceLink';

/** History is metadata-only: no image fetch, object URL or persisted thumbnail. */
export const ThreadImageReference = ({
    item,
}: {
    item: Extract<AiPromptContextItem, { type: 'thread_image' }>;
}) => (
    <ContentReferenceLink
        kind="thread_image"
        showArrow={false}
        title={item.fileName}
    >
        {`${item.fileName} · ${item.width}×${item.height}`}
    </ContentReferenceLink>
);
