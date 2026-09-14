import { type FC } from 'react';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { DataAppActivityTable } from './DataAppActivityTable';

export const DataAppActivitySettingsPage: FC = () => (
    <SettingsPage
        title="Activity"
        description="See who generated which data app, when, and with which model."
    >
        <DataAppActivityTable />
    </SettingsPage>
);
