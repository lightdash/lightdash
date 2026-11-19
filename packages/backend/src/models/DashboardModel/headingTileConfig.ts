import {
    DEFAULT_DASHBOARD_HEADING_SIZE,
    DEFAULT_DASHBOARD_HEADING_TEXT_ALIGN,
    DEFAULT_DASHBOARD_HEADING_VERTICAL_ALIGN,
    type DashboardHeadingSize,
    type DashboardHeadingTextAlign,
    type DashboardHeadingTileProperties,
    type DashboardHeadingVerticalAlign,
} from '@lightdash/common';

type HeadingTileConfigV1 = {
    version: 1;
    size: DashboardHeadingSize;
    textAlign: DashboardHeadingTextAlign;
    verticalAlign: DashboardHeadingVerticalAlign;
};

/** What the `config` column of a heading tile holds. Add a version to change its shape */
export type DbHeadingTileConfig = HeadingTileConfigV1;

type HeadingTileFormat = Required<
    Pick<
        DashboardHeadingTileProperties['properties'],
        'size' | 'textAlign' | 'verticalAlign'
    >
>;

const DEFAULT_FORMAT: HeadingTileFormat = {
    size: DEFAULT_DASHBOARD_HEADING_SIZE,
    textAlign: DEFAULT_DASHBOARD_HEADING_TEXT_ALIGN,
    verticalAlign: DEFAULT_DASHBOARD_HEADING_VERTICAL_ALIGN,
};

export const toDbHeadingTileConfig = (
    properties: DashboardHeadingTileProperties['properties'],
): DbHeadingTileConfig => ({
    version: 1,
    size: properties.size ?? DEFAULT_FORMAT.size,
    textAlign: properties.textAlign ?? DEFAULT_FORMAT.textAlign,
    verticalAlign: properties.verticalAlign ?? DEFAULT_FORMAT.verticalAlign,
});

// A row written before the column existed, or by a version this build does
// not know, reads as the defaults
export const fromDbHeadingTileConfig = (
    config: DbHeadingTileConfig | null,
): HeadingTileFormat =>
    config?.version === 1
        ? {
              size: config.size ?? DEFAULT_FORMAT.size,
              textAlign: config.textAlign ?? DEFAULT_FORMAT.textAlign,
              verticalAlign:
                  config.verticalAlign ?? DEFAULT_FORMAT.verticalAlign,
          }
        : DEFAULT_FORMAT;
