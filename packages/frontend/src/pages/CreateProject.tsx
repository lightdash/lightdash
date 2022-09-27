import { WarehouseTypes } from '@lightdash/common';
import { FC } from 'react';
import { Redirect, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ConnectManually from '../components/ProjectConnection/ProjectConnectFlow/ConnectManually';
import ConnectSuccess from '../components/ProjectConnection/ProjectConnectFlow/ConnectSuccess';
import ConnectUsingCLI from '../components/ProjectConnection/ProjectConnectFlow/ConnectUsingCLI';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import useSearchParams from '../hooks/useSearchParams';
import { useApp } from '../providers/AppProvider';

export type SelectedWarehouse = {
    label: string;
    key: WarehouseTypes;
    icon: string;
};

enum ConnectMethod {
    CLI = 'cli',
    MANUAL = 'manual',
}

const CreateProject: FC = () => {
    const { health } = useApp();
    const { isLoading, data: organisation } = useOrganisation();
    const projectUuid = useSearchParams('projectUuid');

    const { method } = useParams<{ method: ConnectMethod }>();

    if (health.isLoading || isLoading || !organisation) {
        return <PageSpinner />;
    }

    if (method && projectUuid) {
        return <ConnectSuccess projectUuid={projectUuid} />;
    }

    return (
        <ProjectFormProvider>
            <Page noContentPadding>
                {method === ConnectMethod.CLI && <ConnectUsingCLI />}
                {method === ConnectMethod.MANUAL && <ConnectManually />}

                {!method && (
                    <Redirect to={`/createProject/${ConnectMethod.CLI}`} />
                )}
            </Page>
        </ProjectFormProvider>
    );
};

export default CreateProject;
