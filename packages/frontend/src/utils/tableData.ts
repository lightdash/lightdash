export const modifiedItem = (item: string | boolean) => {
    if (typeof item === 'boolean') {
        return item ? 'Yes' : 'No';
    }
    return item;
};

export const mapDataToTable = (plotData: Record<string, any>[]) => {
    const headers: string[] = plotData.map((item: {}) => Object.keys(item))[0];
    const rows: any[] = plotData.map((row: {}) => Object.values(row));
    return { headers, rows };
};
