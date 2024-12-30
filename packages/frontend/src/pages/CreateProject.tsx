import { useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router-dom-v5-compat';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ConnectManually from '../components/ProjectConnection/ProjectConnectFlow/ConnectManually';
import ConnectSuccess from '../components/ProjectConnection/ProjectConnectFlow/ConnectSuccess';
import ConnectUsingCLI from '../components/ProjectConnection/ProjectConnectFlow/ConnectUsingCLI';
import SelectConnectMethod from '../components/ProjectConnection/ProjectConnectFlow/SelectConnectMethod';
import SelectWarehouse, {
    OtherWarehouse,
    type SelectedWarehouse,
} from '../components/ProjectConnection/ProjectConnectFlow/SelectWarehouse';
import UnsupportedWarehouse from '../components/ProjectConnection/ProjectConnectFlow/UnsupportedWarehouse';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useOrganization } from '../hooks/organization/useOrganization';
import useSearchParams from '../hooks/useSearchParams';
import { useApp } from '../providers/AppProvider';

export enum ConnectMethod {
    CLI = 'cli',
    MANUAL = 'manual',
}

const CreateProject: FC = () => {
    const navigate = useNavigate();
    const { isInitialLoading: isLoadingOrganization, data: organization } =
        useOrganization();

    const {
        health: { data: health, isInitialLoading: isLoadingHealth },
    } = useApp();

    const { method } = useParams<{ method: ConnectMethod }>();
    const projectUuid = useSearchParams('projectUuid');

    const [warehouse, setWarehouse] = useState<SelectedWarehouse>();

    if (isLoadingHealth || !health || isLoadingOrganization || !organization) {
        return <PageSpinner />;
    }

    const isCreatingFirstProject = !!organization.needsProject;

    return (
        <ProjectFormProvider>
            <Page title="Create project" withFixedContent withPaddedContent>
                {method && projectUuid ? (
                    <ConnectSuccess projectUuid={projectUuid} />
                ) : (
                    <>
                        {!warehouse ? (
                            <SelectWarehouse
                                isCreatingFirstProject={isCreatingFirstProject}
                                onSelect={setWarehouse}
                            />
                        ) : warehouse === OtherWarehouse.Other ? (
                            <UnsupportedWarehouse
                                onBack={() => {
                                    setWarehouse(undefined);
                                    navigate('/createProject', {
                                        replace: true,
                                    });
                                }}
                            />
                        ) : (
                            <>
                                {warehouse && !method && (
                                    <SelectConnectMethod
                                        isCreatingFirstProject={
                                            isCreatingFirstProject
                                        }
                                        onSelect={(newMethod) => {
                                            navigate(
                                                `/createProject/${newMethod}`,
                                                { replace: true },
                                            );
                                        }}
                                        onBack={() => {
                                            setWarehouse(undefined);
                                        }}
                                    />
                                )}

                                {warehouse && method === ConnectMethod.CLI && (
                                    <ConnectUsingCLI
                                        siteUrl={health.siteUrl}
                                        version={health.version}
                                        onBack={() => {
                                            navigate('/createProject', {
                                                replace: true,
                                            });
                                        }}
                                    />
                                )}

                                {warehouse &&
                                    method === ConnectMethod.MANUAL && (
                                        <ConnectManually
                                            isCreatingFirstProject={
                                                isCreatingFirstProject
                                            }
                                            selectedWarehouse={warehouse}
                                            onBack={() => {
                                                navigate('/createProject', {
                                                    replace: true,
                                                });
                                            }}
                                        />
                                    )}
                            </>
                        )}
                    </>
                )}
            </Page>
        </ProjectFormProvider>
    );
};

export default CreateProject;
