import { type AiPromptContextItem } from '@lightdash/common';
import { ThreadImageCard } from './ThreadImageCard';

/** History is metadata-only: no image fetch, object URL or persisted thumbnail. */
export const ThreadImageReference = ({
    item,
    layout = 'standalone',
}: {
    item: Extract<AiPromptContextItem, { type: 'thread_image' }>;
    layout?: 'grid' | 'standalone';
}) => (
    <ThreadImageCard
        fileName={item.fileName}
        width={item.width}
        height={item.height}
        previewUrl={null}
        layout={layout}
        action={null}
    />
);
