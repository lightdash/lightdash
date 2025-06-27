/**
 * Utility functions for formatting chart error messages
 */

/**
 * Formats an error message to include the chart name for better identification
 * @param chartName - The name of the chart that encountered the error
 * @param errorMessage - The original error message
 * @returns Formatted error message with chart name
 */
export const formatChartErrorMessage = (
    chartName: string | undefined,
    errorMessage: string,
): string => {
    // Handle cases where chart name might be undefined or empty
    if (!chartName || chartName.trim() === '') {
        return errorMessage;
    }

    // Format: "Chart '[ChartName]': [ErrorMessage]"
    return `Chart '${chartName.trim()}': ${errorMessage}`;
};
