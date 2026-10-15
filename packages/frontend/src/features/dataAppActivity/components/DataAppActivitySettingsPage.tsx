import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { DataAppActivityTable } from './DataAppActivityTable';

export const DataAppActivitySettingsPage: FC = () => {
    const { t } = useTranslation('queryHistory');
    return (
        <SettingsPage
            title={t('dataAppActivity.settingsPage.title')}
            description={t('dataAppActivity.settingsPage.description')}
        >
            <DataAppActivityTable />
        </SettingsPage>
    );
};
