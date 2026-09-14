import { useState } from 'react';

// Draft state for a controlled Date prop: holds local edits (e.g. a partial
// range) but resets whenever the prop's instant changes. Syncs during render
// instead of via useEffect so a prop change can never clobber edits a render late.
export const useDraftDate = (
    value: Date | null,
): [Date | null, (date: Date | null) => void] => {
    const [draft, setDraft] = useState(value);
    const [prev, setPrev] = useState(value);

    if ((prev?.getTime() ?? null) !== (value?.getTime() ?? null)) {
        setPrev(value);
        setDraft(value);
    }

    return [draft, setDraft];
};
