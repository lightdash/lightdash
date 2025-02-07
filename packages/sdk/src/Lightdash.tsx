import {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    EmbedDashboard,
    EmbedProvider,
    ErrorBoundary,
    FullscreenProvider,
    MantineProvider,
    MemoryRouter,
    ReactQueryProvider,
    ThirdPartyServicesProvider,
    TrackingProvider,
} from '@lightdash/frontend';
import { FC, useEffect, useState } from 'react';

type Props = {
    projectUuid: string;
    token: Promise<string> | string;
    instanceUrl: string;
};

const persistInstanceUrl = (instanceUrl: string) => {
    localStorage.setItem(
        // TODO: should be a constant
        '__lightdash_sdk_instance_url',
        instanceUrl,
    );
};

const Dashboard: FC<Props> = ({ token, instanceUrl, projectUuid }) => {
    const [tokenString, setTokenString] = useState<string | null>(null);

    useEffect(() => {
        if (typeof token === 'string') {
            persistInstanceUrl(instanceUrl);
            setTokenString(token);
        } else {
            token.then((t) => {
                persistInstanceUrl(instanceUrl);
                setTokenString(t);
            });
        }
    }, [token]);

    if (!tokenString) {
        return null;
    }

    console.log('token', tokenString);

    return (
        <ReactQueryProvider>
            <MantineProvider>
                <AppProvider>
                    <FullscreenProvider enabled={false}>
                        <ThirdPartyServicesProvider enabled={false}>
                            <ErrorBoundary wrapper={{ mt: '4xl' }}>
                                <MemoryRouter>
                                    <TrackingProvider enabled={true}>
                                        <AbilityProvider>
                                            <ActiveJobProvider>
                                                <ChartColorMappingContextProvider>
                                                    <EmbedProvider
                                                        embedToken={tokenString}
                                                    >
                                                        <div
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                position:
                                                                    'relative',
                                                                overflow:
                                                                    'auto',
                                                            }}
                                                        >
                                                            <EmbedDashboard
                                                                projectUuid={
                                                                    projectUuid
                                                                }
                                                            />
                                                        </div>
                                                    </EmbedProvider>
                                                </ChartColorMappingContextProvider>
                                            </ActiveJobProvider>
                                        </AbilityProvider>
                                    </TrackingProvider>
                                </MemoryRouter>
                            </ErrorBoundary>
                        </ThirdPartyServicesProvider>
                    </FullscreenProvider>
                </AppProvider>
            </MantineProvider>
        </ReactQueryProvider>
    );
};

const Lightdash = { Dashboard };

export default Lightdash;
