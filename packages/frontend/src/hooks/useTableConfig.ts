import { ApiQueryResults, Explore, TableChart } from '@lightdash/common';
import { useMemo, useState } from 'react';

const useBigNumberConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const [showTableNames, setShowTableName] = useState<boolean>(
        tableChartConfig?.showTableNames === undefined
            ? true
            : tableChartConfig.showTableNames,
    );

    const validTableConfig: TableChart = useMemo(
        () => ({
            showTableNames,
        }),
        [showTableNames],
    );
    return {
        validTableConfig,
        showTableNames,
        setShowTableName,
    };
};

export default useBigNumberConfig;
