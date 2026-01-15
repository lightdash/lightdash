export const toSheetValues = (
    headers: string[],
    rows: Array<Record<string, unknown>>,
) => {
    const values = [
        headers,
        ...rows.map((row) => headers.map((header) => row[header] ?? '')),
    ];

    return { values };
};
