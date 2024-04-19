import { type ResultRow } from '../../types/results';

export abstract class AbstractResultTransformer {
    /**
     * Unique identifier for the results transformer
     */
    abstract type: string;

    /**
     * Get the rows from the results transformer
     */
    abstract getRows(): ResultRow[];

    /**
     * Get the field options from the results transformer
     */
    abstract getFieldOptions(): string[];
}
