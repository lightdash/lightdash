import {
    ApiQueryResults,
    BigNumber,
    Explore,
    findFieldByIdInExplore,
    formatValue,
    friendlyName,
    getFieldLabel,
    isNumericItem,
} from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const fieldId =
        resultsData?.metricQuery.metrics[0] ||
        resultsData?.metricQuery.dimensions[0] ||
        resultsData?.metricQuery.tableCalculations[0]?.name;

    const field =
        explore && fieldId
            ? findFieldByIdInExplore(explore, fieldId)
            : undefined;
    const label = field
        ? getFieldLabel(field)
        : fieldId && friendlyName(fieldId);

    const [bigNumberLabel, setBigNumberLabel] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label);

    const [bigNumberStyle, setBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);

    useEffect(() => {
        setBigNumberLabel(bigNumberConfigData?.label);
        setBigNumberStyle(bigNumberConfigData?.style);
    }, [bigNumberConfigData]);

    const bigNumberRaw =
        fieldId && resultsData?.rows?.[0]?.[fieldId]?.value.raw;

    const isNumber = isNumericItem(field) && !(bigNumberRaw instanceof Date);

    const bigNumber = !isNumber
        ? fieldId && resultsData?.rows?.[0]?.[fieldId]?.value.formatted
        : formatValue(
              field?.format,
              bigNumberStyle ? 2 : field?.round,
              bigNumberRaw,
              bigNumberStyle,
          );

    const showStyle = isNumber && field?.format !== 'percent';

    const validBigNumberConfig: BigNumber = useMemo(
        () => ({
            label: bigNumberLabel,
            style: bigNumberStyle,
        }),
        [bigNumberLabel, bigNumberStyle],
    );
    return {
        bigNumber,
        bigNumberLabel,
        defaultLabel: label,
        setBigNumberLabel,
        validBigNumberConfig,
        bigNumberStyle,
        setBigNumberStyle,
        showStyle,
    };
};

export default useBigNumberConfig;
