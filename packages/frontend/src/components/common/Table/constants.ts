export const DEFAULT_PAGE_SIZE = 10;

export const ROW_NUMBER_COLUMN_ID = 'row_number_column';

// arbitrary number that is usually smaller than the 300px max width of the cell
export const SMALL_TEXT_LENGTH = 35;

// Needed for virtualization. Matches value from Pivot table.
export const ROW_HEIGHT_PX = 34;

// Table typography and cell sizing
export const TABLE_FONT_SIZE_PX = 14;
export const TABLE_HEADER_FONT_WEIGHT = 600;
export const CELL_HORIZONTAL_PADDING_PX = 11;
export const CELL_VERTICAL_PADDING_PX = 6;
export const MAX_CELL_WIDTH_PX = 300;

// Frozen/locked column styling constants
export const FROZEN_COLUMN_BACKGROUND =
    'light-dark(var(--mantine-color-background-0), var(--mantine-color-ldGray-0))';

export const FROZEN_COLUMN_BORDER_COLOR = 'var(--mantine-color-ldGray-4)';

export const FROZEN_COLUMN_BORDER_WIDTH = '1.4px';
