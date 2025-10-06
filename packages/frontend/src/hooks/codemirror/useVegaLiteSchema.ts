import { useEffect, useState } from 'react';

/**
 * Hook to load Vega-Lite JSON schema for autocomplete and validation
 */
export const useVegaLiteSchema = (): object | undefined => {
    const [schema, setSchema] = useState<object | undefined>(undefined);

    useEffect(() => {
        const loadSchema = async () => {
            try {
                const vegaLiteSchema = await import(
                    'vega-lite/build/vega-lite-schema.json'
                );
                setSchema(vegaLiteSchema.default);
            } catch (error) {
                console.error('Failed to load Vega-Lite schema:', error);
            }
        };

        void loadSchema();
    }, []);

    return schema;
};
