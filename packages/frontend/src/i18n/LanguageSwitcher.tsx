import { Select } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from './resources';

const nativeLanguageName = (language: string) =>
    new Intl.DisplayNames([language], { type: 'language' }).of(language) ??
    language;

const options = supportedLanguages.map((language) => ({
    value: language,
    label: nativeLanguageName(language),
}));

export const LanguageSwitcher: FC = () => {
    const { t, i18n } = useTranslation();
    return (
        <Select
            label={t('language.label')}
            data={options}
            value={i18n.resolvedLanguage ?? null}
            onChange={(language) => {
                if (language) void i18n.changeLanguage(language);
            }}
            allowDeselect={false}
        />
    );
};
