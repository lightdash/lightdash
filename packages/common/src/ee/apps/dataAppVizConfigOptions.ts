// Leaf module: the data app viz config-option vocabulary. Kept free of any
// import so both `ee/apps/types.ts` and `types/savedCharts.ts` can depend on it
// without forming a cycle.

export type DataAppVizConfigOptionType =
    | 'boolean'
    | 'select'
    | 'number'
    | 'text'
    | 'color'
    | 'gradient';

/**
 * A stored gradient: two to five fixed hex colours from low to high, evenly
 * spaced, and a lower and upper bound that are each a number or 'auto'.
 */
export type DataAppVizGradientValue = {
    colors: string[];
    min: number | 'auto';
    max: number | 'auto';
};

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
      }
    | {
          type: 'gradient';
          name: string;
          label: string;
          group?: string;
          default: DataAppVizGradientValue;
      };

/** A persisted config value; its shape is set by the option's declared `type`. */
export type DataAppVizOptionValue =
    | boolean
    | number
    | string
    | DataAppVizGradientValue;

/**
 * A gradient as delivered to the chart: 'auto' bounds are resolved from the
 * field's values, or null when the chart supplies them.
 */
export type DataAppVizGradient = {
    colors: string[];
    min: number | null;
    max: number | null;
};

/** A config value as delivered to the chart. */
export type DataAppVizContextOptionValue =
    | boolean
    | number
    | string
    | DataAppVizGradient;

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
