import {
    type AbstractVizConfigTransformer,
    type VizConfigTransformerArguments,
} from './AbstractVizConfigTransformer';
import { BarConfigTransformer } from './Cartisean/BarConfigTransformer';
import { TableConfigTransformer } from './Table/TableConfigTransformer';

/**
 * List of available viz libraries
 */
const VIZ_CONFIGS = [BarConfigTransformer, TableConfigTransformer] as const;

/**
 * Factory class to create VizConfigTransformer objects
 */
export class VizConfigTransformerFactory {
    /**
     * Returns the list of supported vizConfig types
     */
    static listVizConfigs(): string[] {
        return VIZ_CONFIGS.map((c) => c.type);
    }

    /**
     * Creates a new VizConfigTransformer object based on the type
     */
    static createVizConfigTransformer(
        args: VizConfigTransformerArguments,
    ): AbstractVizConfigTransformer {
        const { type } = args.vizConfig;
        const Transformer = VIZ_CONFIGS.find((c) => c.type === type);

        if (Transformer) {
            return new Transformer(args);
        }
        throw new Error(`Unsupported viz config: ${type}`);
    }
}
