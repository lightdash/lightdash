import { WarehouseTypes } from '@lightdash/common';
import { FC, useEffect, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ConnectManually from '../components/ProjectConnection/ProjectConnectFlow/ConnectManually';
import ConnectSuccess from '../components/ProjectConnection/ProjectConnectFlow/ConnectSuccess';
import ConnectUsingCLI from '../components/ProjectConnection/ProjectConnectFlow/ConnectUsingCLI';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
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
    const history = useHistory();
    const location = useLocation();
    const { isLoading, data: organisation } = useOrganisation();

    const method = useMemo(() => {
        const queryParams = new URLSearchParams(location.search);
        return queryParams.get('method') as ConnectMethod | null;
    }, [location.search]);

    const projectUuid = useMemo(() => {
        const queryParams = new URLSearchParams(location.search);
        return queryParams.get('projectUuid');
    }, [location.search]);

    useEffect(() => {
        if (projectUuid || method || !organisation || organisation.name === '')
            return;

        if (organisation.needsProject) {
            history.push(`/createProject?method=${ConnectMethod.CLI}`);
        } else {
            history.push(`/createProject?method=${ConnectMethod.MANUAL}`);
        }
    }, [projectUuid, method, isLoading, organisation, history]);

    console.log({ projectUuid });

    if (!method && !projectUuid) {
        return null;
    }

    if (health.isLoading || isLoading || !organisation) {
        return <PageSpinner />;
    }

    return (
        <ProjectFormProvider>
            <Page
            // TODO
            // hideFooter={!!selectedWarehouse}
            // noContentPadding={!!selectedWarehouse}
            >
                {projectUuid && <ConnectSuccess projectUuid={projectUuid} />}

                {method === ConnectMethod.CLI && <ConnectUsingCLI />}

                {method === ConnectMethod.MANUAL && (
                    <ConnectManually organisation={organisation} />
                )}
            </Page>
        </ProjectFormProvider>
    );
};

export default CreateProject;
