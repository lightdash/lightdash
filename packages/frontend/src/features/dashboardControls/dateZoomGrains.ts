import {
    isStandardDateGranularity,
    type UiStringResolver,
} from '@lightdash/common';
import { type ComboboxData } from '@mantine/core';
import { getGranularityLabel } from '../dateZoom/utils';

/** Grains as the shipped menu lists them: standard in order, then custom by label. */
export const splitGrains = (
    granularities: string[],
    customLabels: Record<string, string>,
    getUiString: UiStringResolver,
) => ({
    standard: granularities.filter((grain) => isStandardDateGranularity(grain)),
    custom: granularities
        .filter((grain) => !isStandardDateGranularity(grain))
        .sort((a, b) =>
            getGranularityLabel(a, customLabels, getUiString).localeCompare(
                getGranularityLabel(b, customLabels, getUiString),
            ),
        ),
});

/** A grain select's options: standard grains, then a "Custom" group. */
export const getGrainOptions = (
    granularities: string[],
    customLabels: Record<string, string>,
    getUiString: UiStringResolver,
): ComboboxData => {
    const { standard, custom } = splitGrains(
        granularities,
        customLabels,
        getUiString,
    );
    const toItem = (grain: string) => ({
        value: grain,
        label: getGranularityLabel(grain, customLabels, getUiString),
    });
    return [
        ...standard.map(toItem),
        ...(custom.length > 0
            ? [
                  {
                      group: getUiString('controls.dateZoom.custom'),
                      items: custom.map(toItem),
                  },
              ]
            : []),
    ];
};
