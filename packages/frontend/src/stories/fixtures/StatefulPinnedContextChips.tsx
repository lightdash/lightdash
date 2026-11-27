import { type AiPromptContextItem } from '@lightdash/common';
import { useState } from 'react';
import { getPromptContextItemKey } from '../../ee/features/aiCopilot/components/ChatElements/contentReferenceUtils';
import { PinnedContextChips } from '../../ee/features/aiCopilot/components/PinnedContextChips/PinnedContextChips';

/** Owns the pinned list so removing a chip works as it does in the app. */
export const StatefulPinnedContextChips = ({
    initialItems,
}: {
    initialItems: AiPromptContextItem[];
}) => {
    const [items, setItems] = useState(initialItems);
    return (
        <PinnedContextChips
            items={items}
            onRemove={(removed) =>
                setItems((current) =>
                    current.filter(
                        (item) =>
                            getPromptContextItemKey(item) !==
                            getPromptContextItemKey(removed),
                    ),
                )
            }
        />
    );
};
