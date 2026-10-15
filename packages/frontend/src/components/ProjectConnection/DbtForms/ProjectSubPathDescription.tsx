import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';

export const ProjectSubPathDescription: FC<{ provider: string }> = ({
    provider,
}) => {
    const { t } = useTranslation('projectConnection');
    return (
        <>
            <p>
                <Trans
                    t={t}
                    i18nKey="dbtForms.subPathFolder"
                    values={{ provider }}
                    components={{ b: <b /> }}
                />
            </p>
            <p>
                <Trans
                    t={t}
                    i18nKey="dbtForms.subPathMainFolder"
                    values={{
                        example:
                            'lightdash/lightdash-analytics/dbt_project.yml',
                    }}
                    components={{ b: <b /> }}
                />
            </p>
            <p>
                <Trans
                    t={t}
                    i18nKey="dbtForms.subPathSubFolder"
                    values={{
                        example:
                            'lightdash/lightdash-analytics/dbt/dbt_project.yml',
                    }}
                    components={{ b: <b /> }}
                />
            </p>
        </>
    );
};
