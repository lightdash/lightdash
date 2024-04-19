import {
    type AbstractVizLibTransformer,
    type AbstractVizLibTransformerArguments,
} from './AbstractVizLibTransformer';
import { TableTransformer } from './Table/TableTransformer';
import { VegaTransformer } from './Vega/VegaTransformer';

/**
 * List of all supported viz libraries
 */
const VIZ_LIBS = [VegaTransformer, TableTransformer] as const;

type LibType = typeof VIZ_LIBS[number]['type'];

/**
 * Factory class to create VizLib transformers
 */
export class VizLibTransformerFactory {
    /**
     * Returns the viz lib class based on the viz type and existing lib type
     */
    static getVizLib(vizType: string, libType?: LibType) {
        const libsThatSupportViz = VIZ_LIBS.filter((c) =>
            c.supportedVizTypes.includes(vizType),
        );
        if (libsThatSupportViz.length === 0) {
            throw new Error(`Unsupported viz type: ${vizType}`);
        }
        const lib = libsThatSupportViz.find((c) => c.type === libType);
        if (lib) {
            return lib;
        }
        return libsThatSupportViz[0];
    }

    /**
     * Creates a VizLib transformer based on the viz config transformer
     */
    static createVizLibTransformer(
        args: AbstractVizLibTransformerArguments & {
            libType?: LibType;
        },
    ): AbstractVizLibTransformer {
        const { libType, ...rest } = args;
        const { type } = rest.vizConfigTransformer.getVizConfig();
        const Transformer = VizLibTransformerFactory.getVizLib(type, libType);

        if (Transformer) {
            // @ts-ignore TODO: we need to fix typing to for viz lib classes handle invalid viz configs
            return new Transformer(rest);
        }
        throw new Error(`Unsupported viz config: ${type}`);
    }
}
