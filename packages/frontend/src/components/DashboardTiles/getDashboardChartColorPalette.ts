type GetDashboardChartColorPaletteArgs = {
    colorScheme: 'light' | 'dark';
    chartColorPalette: string[];
    selectedPaletteColors?: string[];
    selectedPaletteDarkColors?: string[] | null;
    orgColorPalette?: string[];
    orgDarkColorPalette?: string[];
};

export const getDashboardChartColorPalette = ({
    colorScheme,
    chartColorPalette,
    selectedPaletteColors,
    selectedPaletteDarkColors,
    orgColorPalette,
    orgDarkColorPalette,
}: GetDashboardChartColorPaletteArgs): string[] => {
    if (colorScheme === 'dark' && selectedPaletteDarkColors?.length) {
        return selectedPaletteDarkColors;
    }

    if (selectedPaletteColors?.length) {
        return selectedPaletteColors;
    }

    if (colorScheme === 'dark' && orgDarkColorPalette?.length) {
        return orgDarkColorPalette;
    }

    return orgColorPalette ?? chartColorPalette;
};
