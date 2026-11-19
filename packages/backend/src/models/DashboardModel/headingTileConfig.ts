import {
    type DashboardHeadingSize,
    type DashboardHeadingTextAlign,
    type DashboardHeadingTileProperties,
    type DashboardHeadingVerticalAlign,
} from '@lightdash/common';

type HeadingTileConfigV1 = {
    version: 1;
    size: DashboardHeadingSize | null;
    textAlign: DashboardHeadingTextAlign | null;
    verticalAlign: DashboardHeadingVerticalAlign | null;
};

/** What the `heading_config` column of a heading tile holds. Add a version to change its shape */
export type DbHeadingTileConfig = HeadingTileConfigV1;

type HeadingTileFormat = Pick<
    DashboardHeadingTileProperties['properties'],
    'size' | 'textAlign' | 'verticalAlign'
>;

// A heading with no setting chosen keeps a null config, so it stays the same
// row, and the same API response, as before the column existed
export const toDbHeadingTileConfig = ({
    size,
    textAlign,
    verticalAlign,
}: DashboardHeadingTileProperties['properties']): DbHeadingTileConfig | null =>
    size === undefined && textAlign === undefined && verticalAlign === undefined
        ? null
        : {
              version: 1,
              size: size ?? null,
              textAlign: textAlign ?? null,
              verticalAlign: verticalAlign ?? null,
          };

// Only the settings that were chosen are returned: the rest stay omitted, and
// so does everything in a version this build does not know
export const fromDbHeadingTileConfig = (
    config: DbHeadingTileConfig | null,
): HeadingTileFormat =>
    config?.version === 1
        ? {
              ...(config.size ? { size: config.size } : {}),
              ...(config.textAlign ? { textAlign: config.textAlign } : {}),
              ...(config.verticalAlign
                  ? { verticalAlign: config.verticalAlign }
                  : {}),
          }
        : {};
