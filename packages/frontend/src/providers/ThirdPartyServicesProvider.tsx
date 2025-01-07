import { LightdashMode } from '@lightdash/common';
import { PostHogProvider, usePostHog } from 'posthog-js/react';
import { useCallback, useEffect, type FC } from 'react';
import { IntercomProvider } from 'react-use-intercom';
import { Intercom } from '../components/Intercom';
import useSentry from '../hooks/thirdPartyServices/useSentry';
import useApp from './App/useApp';

const usePylon = () => {
    const { user, health } = useApp();

    // REFERENCE: https://docs.usepylon.com/pylon-docs/in-app-chat/chat-setup
    const initPylonWidget = useCallback((appId: string) => {
        const PYLON_WIDGET_URL = 'https://widget.usepylon.com/widget/';
        const e = window;
        const t = document;
        const n = function () {
            n.e(arguments); // eslint-disable-line
        };
        n.q = [] as unknown[];
        n.e = function (u: unknown) {
            n.q.push(u);
        };
        // @ts-ignore
        e.Pylon = n;
        const r = function () {
            const s = t.createElement('script');
            s.setAttribute('type', 'text/javascript');
            s.setAttribute('async', 'true');
            s.setAttribute('src', `${PYLON_WIDGET_URL}${appId}`);
            const ns = t.getElementsByTagName('script')[0];
            if (ns.parentNode) {
                ns.parentNode.insertBefore(s, ns);
            }
        };
        if (t.readyState === 'complete') {
            r();
        } else if (e.addEventListener) {
            e.addEventListener('load', r, false);
        }
    }, []);

    useEffect(
        function initPylon() {
            if (health.data?.pylon?.appId && user.data) {
                // @ts-ignore
                window.pylon = {
                    chat_settings: {
                        app_id: health.data.pylon.appId,
                        email: user.data.email,
                        name: `${user.data.firstName} ${user.data.lastName}`,
                        email_hash: health.data.pylon.verificationHash,
                    },
                };

                // @ts-ignore
                if (!window.Pylon) {
                    initPylonWidget(health.data.pylon.appId);
                }

                // @ts-ignore
                if (window.Pylon) {
                    // @ts-ignore
                    window.Pylon('setNewIssueCustomFields', {
                        user_uuid: user.data.userUuid,
                        org_uuid: user.data.organizationUuid,
                        org_name: user.data.organizationName,
                        user_role: user.data.role,
                    });
                }
            }
        },
        [user, health, initPylonWidget],
    );
};

const Clarity = () => {
    const { health } = useApp();

    if (health.data?.mode !== LightdashMode.DEMO) {
        return null;
    }

    return (
        <script type="text/javascript">
            {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "ngeq4wyadb");`}
        </script>
    );
};

const PosthogIdentified: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const { user } = useApp();
    const posthog = usePostHog();
    if (user.data) {
        posthog.identify(user.data.userUuid, {
            uuid: user.data.userUuid,
            ...(user.data.isTrackingAnonymized
                ? {}
                : {
                      email: user.data.email,
                      first_name: user.data.firstName,
                      last_name: user.data.lastName,
                  }),
        });
        if (user.data.organizationUuid) {
            posthog.group('organization', user.data.organizationUuid, {
                uuid: user.data.organizationUuid,
                name: user.data.organizationName,
            });
        }
    }
    return <>{children}</>;
};

const ThirdPartyServicesEnabledProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const { health, user } = useApp();

    useSentry(health?.data?.sentry, user.data);
    usePylon();

    return (
        <IntercomProvider
            appId={health.data?.intercom.appId || ''}
            shouldInitialize={!!health.data?.intercom.appId}
            apiBase={health.data?.intercom.apiBase || ''}
            autoBoot
        >
            <PostHogProvider
                apiKey={health.data?.posthog?.projectApiKey || ''}
                options={{
                    api_host: health.data?.posthog?.feApiHost,
                    autocapture: false,
                    capture_pageview: false,
                }}
            >
                <PosthogIdentified>
                    <Intercom />
                    <Clarity />
                    {children}
                </PosthogIdentified>
            </PostHogProvider>
        </IntercomProvider>
    );
};

interface ThirdPartyServicesProviderProps {
    enabled?: boolean;
}

const ThirdPartyServicesProvider: FC<
    React.PropsWithChildren<ThirdPartyServicesProviderProps>
> = ({ children, enabled }) => {
    if (enabled) {
        return (
            <ThirdPartyServicesEnabledProvider>
                {children}
            </ThirdPartyServicesEnabledProvider>
        );
    } else {
        return <>{children}</>;
    }
};

export default ThirdPartyServicesProvider;
