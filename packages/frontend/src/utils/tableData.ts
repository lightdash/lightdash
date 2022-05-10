export const modifiedItem = (item: string | boolean) => {
    if (typeof item === 'boolean') {
        return item ? 'Yes' : 'No';
    }
    return item;
};

export const mapDataToTable = (
    plotData: Record<string, any>[],
    sortedColumns: string[],
) => {
    const rows: any[] = plotData.map((row) => {
        const filteredRow = Object.entries(row).filter(
            ([k, v]) => sortedColumns.indexOf(k) !== -1,
        );
        const sortedRow = filteredRow.sort(
            ([k, v], [kb, vb]) =>
                sortedColumns.indexOf(k) - sortedColumns.indexOf(kb),
        );
        return sortedRow.map(([k, v]) => v);
    });
    return rows;
};

export const valueIsNaN = (value: any): boolean => {
    return (
        typeof value === 'boolean' ||
        (value?.includes && value.includes('Z')) || //  stringified date
        Number.isNaN(Number(value))
    );
};
