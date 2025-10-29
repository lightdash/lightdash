import { type MantineTheme } from '@mantine/core';
import { isColorDark } from './colorUtils';

/**
 * Get pie slice styling
 */
export const getPieSliceStyle = (isDonut: boolean) =>
    isDonut
        ? {
              itemStyle: {
                  borderRadius: 4,
                  borderColor: '#fff',
                  borderWidth: 2,
              },
          }
        : {};

/**
 * Get external label styling for pie charts
 */
export const getPieExternalLabelStyle = (theme: MantineTheme) => ({
    fontSize: 12,
    lineHeight: 18,
    // Rich text styles for different parts of the label
    rich: {
        name: {
            color: theme.colors.gray[6],
            fontWeight: 500,
            fontSize: 12,
            lineHeight: 18,
        },
        value: {
            color: theme.colors.gray[7],
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 18,
        },
    },
});

/**
 * Get label line (connector) styling for pie chart external labels
 */
export const getPieLabelLineStyle = (theme: MantineTheme) => ({
    lineStyle: {
        color: theme.colors.gray[3],
    },
});

/**
 * Get internal label styling for pie charts (labels inside slices)
 */
export const getPieInternalLabelStyle = (
    theme: MantineTheme,
    color: string,
) => ({
    color: isColorDark(color) ? '#FFFFFF' : theme.colors.gray[7],
    fontWeight: 500,
    fontSize: 12,
});
