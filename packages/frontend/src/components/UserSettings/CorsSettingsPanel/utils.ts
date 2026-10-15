import {
    getCorsWildcardOriginRegexSource,
    isCorsRegexPattern,
    isCorsWildcardOrigin,
    validateCorsAllowedDomain,
} from '@lightdash/common';
import { type FormErrors } from '@mantine/form';
import i18n from '../../../i18n/i18n';

export type CorsAllowedDomainInputType = 'origin' | 'regex';

export type CorsAllowedDomainInput = {
    type: CorsAllowedDomainInputType;
    value: string;
};

export const getRegexPatternInput = (value: string): string => {
    const trimmedValue = value.trim();
    const pattern = isCorsRegexPattern(trimmedValue)
        ? trimmedValue.slice(1, -1)
        : trimmedValue;
    return pattern.replace(/^\^/, '').replace(/\$$/, '');
};

const isExactOrigin = (value: string): boolean => {
    try {
        const url = new URL(value);
        return (
            ['http:', 'https:'].includes(url.protocol) && url.origin === value
        );
    } catch {
        return false;
    }
};

const serializeCorsAllowedDomainInput = ({
    type,
    value,
}: CorsAllowedDomainInput): string | null => {
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
        return null;
    }

    if (type === 'regex') {
        return `/^${getRegexPatternInput(trimmedValue)}$/`;
    }

    if (isCorsWildcardOrigin(trimmedValue)) {
        const regexSource = getCorsWildcardOriginRegexSource(trimmedValue);
        return regexSource ? `/${regexSource}/` : trimmedValue;
    }

    return trimmedValue;
};

export const normalizeCorsAllowedDomainsInput = (
    values: CorsAllowedDomainInput[],
): string[] =>
    values
        .map(serializeCorsAllowedDomainInput)
        .filter((value): value is string => value !== null);

export const getInitialCorsAllowedDomainsInput = (
    values: string[],
): CorsAllowedDomainInput[] =>
    values.length > 0
        ? values.map((value) => ({
              type: isCorsRegexPattern(value.trim()) ? 'regex' : 'origin',
              value: isCorsRegexPattern(value.trim())
                  ? getRegexPatternInput(value)
                  : value,
          }))
        : [{ type: 'origin', value: '' }];

export const validateCorsAllowedDomainsInput = (
    values: CorsAllowedDomainInput[],
): FormErrors => {
    const errors: FormErrors = {};
    const seen = new Set<string>();

    values.forEach((input, index) => {
        const serializedValue = serializeCorsAllowedDomainInput(input);
        if (serializedValue === null) {
            return;
        }

        const fieldPath = `corsAllowedDomains.${index}.value`;
        if (input.type === 'regex' && isExactOrigin(input.value.trim())) {
            errors[fieldPath] = i18n.t(
                'corsSettingsPanel.validation.useOriginMode',
                {
                    ns: 'userSettings',
                },
            );
            return;
        }

        const error = validateCorsAllowedDomain(serializedValue);
        if (error) {
            errors[fieldPath] = error;
            return;
        }

        if (seen.has(serializedValue)) {
            errors[fieldPath] = i18n.t('corsSettingsPanel.validation.unique', {
                ns: 'userSettings',
            });
            return;
        }

        seen.add(serializedValue);
    });

    return errors;
};
