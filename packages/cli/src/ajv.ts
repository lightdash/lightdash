import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const ajv = new Ajv({
    coerceTypes: true,
    allErrors: true, // Report all errors, not just the first one
});
addFormats(ajv);
