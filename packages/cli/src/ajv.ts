import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const ajv = new Ajv({
    coerceTypes: true,
    allErrors: true, // Report all errors, not just the first one
    allowUnionTypes: true, // Allow union types like ["string", "boolean"]
    discriminator: true, // Enable discriminator keyword for better oneOf error messages
});
addFormats(ajv);
