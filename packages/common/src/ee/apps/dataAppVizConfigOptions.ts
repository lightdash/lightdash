// Leaf module: the data app viz config-option vocabulary. Kept free of any
// import so both `ee/apps/types.ts` and `types/savedCharts.ts` can depend on it
// without forming a cycle.

export type DataAppVizConfigOptionType =
    | 'boolean'
    | 'select'
    | 'number'
    | 'text'
    | 'color';

// A whole-viz config option rendered as a form control; `group` is an optional tab label.
export type DataAppVizConfigOption =
    | {
          type: 'boolean';
          name: string;
          label: string;
          group?: string;
          default: boolean;
      }
    | {
          type: 'select';
          name: string;
          label: string;
          group?: string;
          choices: { value: string; label: string }[];
          default: string;
      }
    | {
          type: 'number';
          name: string;
          label: string;
          group?: string;
          default: number;
          min?: number;
          max?: number;
      }
    | {
          type: 'text';
          name: string;
          label: string;
          group?: string;
          default: string;
      }
    | {
          type: 'color';
          name: string;
          label: string;
          group?: string;
          default: string;
      };

/** A persisted config value; its shape is set by the option's declared `type`. */
export type DataAppVizOptionValue = boolean | number | string;

/**
 * Declared by a viz that colours from the resolved Lightdash palette. Not a
 * config option: it carries no value of its own, it only asks the config panel
 * for the standard palette picker, whose choice is stored as the chart's
 * palette and delivered on `colorPalette`. There is one palette per chart, so
 * a viz either declares this or it does not.
 */
export type DataAppVizPaletteDeclaration = {
    /** Tab to place the picker in, matching a config option `group`. */
    group?: string;
};
