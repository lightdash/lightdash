import { type AiPromptContextItem } from '@lightdash/common';
import { ContentReferenceLink } from './ContentReferenceLink';

/** History is metadata-only: no image fetch, object URL or persisted thumbnail. */
export const ThreadImageReference = ({
    item,
}: {
    item: Extract<AiPromptContextItem, { type: 'thread_image' }>;
}) => {
    const expiry = new Date(item.expiresAt);
    const expired = expiry.getTime() <= Date.now();
    const retention = expired
        ? 'Expired — re-upload to use again'
        : `Expires ${expiry.toLocaleDateString()}`;
    return (
        <ContentReferenceLink
            kind="thread_image"
            showArrow={false}
            title={`${item.fileName}. ${retention}. Image access lasts 30 days from upload.`}
        >
            {`${item.fileName} · ${item.width}×${item.height} · ${retention}`}
        </ContentReferenceLink>
    );
};
