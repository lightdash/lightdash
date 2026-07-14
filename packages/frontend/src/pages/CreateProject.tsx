import { useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ConnectManually from '../components/ProjectConnection/ProjectConnectFlow/ConnectManually';
import ConnectSuccess from '../components/ProjectConnection/ProjectConnectFlow/ConnectSuccess';
import ConnectUsingCLI from '../components/ProjectConnection/ProjectConnectFlow/ConnectUsingCLI';
import SelectConnectMethod from '../components/ProjectConnection/ProjectConnectFlow/SelectConnectMethod';
import SelectWarehouse from '../components/ProjectConnection/ProjectConnectFlow/SelectWarehouse';
import {
    ConnectMethod,
    OtherWarehouse,
    type SelectedWarehouse,
} from '../components/ProjectConnection/ProjectConnectFlow/types';
import UnsupportedWarehouse from '../components/ProjectConnection/ProjectConnectFlow/UnsupportedWarehouse';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import AgenticOnboardingWizard from '../features/agenticOnboarding/components/AgenticOnboardingWizard';
import { useOnboardingFeatureFlag } from '../features/agenticOnboarding/hooks/useOnboardingFeatureFlag';
import { useOrganization } from '../hooks/organization/useOrganization';
import useSearchParams from '../hooks/useSearchParams';
import useApp from '../providers/App/useApp';

const CreateProject: FC = () => {
    const navigate = useNavigate();
    const { isInitialLoading: isLoadingOrganization, data: organization } =
        useOrganization();
    const { isEnabled: isAgenticOnboardingEnabled, isLoading: isLoadingFlag } =
        useOnboardingFeatureFlag();

    const {
        health: { data: health, isInitialLoading: isLoadingHealth },
    } = useApp();

    const { method } = useParams<{ method: ConnectMethod }>();
    const projectUuid = useSearchParams('projectUuid');

    const [warehouse, setWarehouse] = useState<SelectedWarehouse>();

    if (
        isLoadingHealth ||
        !health ||
        isLoadingOrganization ||
        !organization ||
        isLoadingFlag
    ) {
        return <PageSpinner />;
    }

    if (isAgenticOnboardingEnabled) {
        return <AgenticOnboardingWizard />;
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
                                    void navigate('/createProject', {
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
                                            void navigate(
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
                                            void navigate('/createProject', {
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
                                                void navigate(
                                                    '/createProject',
                                                    {
                                                        replace: true,
                                                    },
                                                );
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
