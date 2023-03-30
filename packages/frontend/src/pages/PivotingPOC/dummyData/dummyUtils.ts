const dummyRawToFormattedAndRaw = (raw: unknown) => {
    if (typeof raw === 'string') {
        return {
            raw,
            formatted: raw,
        };
    } else if (typeof raw === 'number') {
        return {
            raw,
            formatted: raw.toString(),
        };
    } else {
        throw new Error('not implemented');
    }
};

const dummyRawToFormattedAndRawRow = (row: unknown[]) => {
    return row.map(dummyRawToFormattedAndRaw);
};

const dummyRawToFormattedAndRawRows = (rows: unknown[][]) => {
    return rows.map(dummyRawToFormattedAndRawRow);
};

export {
    dummyRawToFormattedAndRaw,
    dummyRawToFormattedAndRawRow,
    dummyRawToFormattedAndRawRows,
};
