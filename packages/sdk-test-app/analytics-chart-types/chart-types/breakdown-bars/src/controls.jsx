export function SegmentedControl({ label, options, value, onChange }) {
    return (
        <div className="segmented" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className="segmented-button"
                    aria-pressed={option.id === value}
                    onClick={() => onChange(option.id)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function EyeIcon({ visible }) {
    return (
        <svg
            className="chip-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            {visible ? (
                <circle cx="12" cy="12" r="3" />
            ) : (
                <path d="M4 4l16 16" />
            )}
        </svg>
    );
}

export function SeriesChips({ label, items, hiddenKeys, onToggle, showEye }) {
    return (
        <div className="chips" role="group" aria-label={label}>
            {items.map((item) => {
                const visible = !hiddenKeys.has(item.key);
                return (
                    <button
                        key={item.key}
                        type="button"
                        className="chip"
                        aria-pressed={visible}
                        onClick={() => onToggle(item.key)}
                    >
                        <span
                            className="chip-swatch"
                            style={{ backgroundColor: item.color }}
                        />
                        {item.label}
                        {item.detail ? ` ${item.detail}` : ''}
                        {showEye && <EyeIcon visible={visible} />}
                    </button>
                );
            })}
        </div>
    );
}

export const toggleKey = (set, key) => {
    const next = new Set(set);
    if (next.has(key)) {
        next.delete(key);
    } else {
        next.add(key);
    }
    return next;
};
