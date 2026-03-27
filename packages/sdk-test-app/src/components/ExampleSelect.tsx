import type { CSSProperties } from 'react';

type ExampleSelectOption = {
    label: string;
    value: string;
};

type ExampleSelectProps = {
    helperText?: string;
    label: string;
    onChange: (value: string) => void;
    options: ExampleSelectOption[];
    value: string;
};

const mono = `'SF Mono', 'Fira Code', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace`;
const sans = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

const labelStyle: CSSProperties = {
    fontFamily: sans,
    fontSize: '12px',
    fontWeight: 500,
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    display: 'block',
};

const helperTextStyle: CSSProperties = {
    fontFamily: sans,
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#737373',
    margin: '8px 0 0 0',
};

const selectStyle: CSSProperties = {
    fontFamily: mono,
    fontSize: '13px',
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    color: '#171717',
    outline: 'none',
};

export function ExampleSelect({
    helperText,
    label,
    onChange,
    options,
    value,
}: ExampleSelectProps) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                style={selectStyle}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {helperText && <p style={helperTextStyle}>{helperText}</p>}
        </div>
    );
}
