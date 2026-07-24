/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare const __APP_VERSION__: string;
declare const __SDK_VERSION__: string | undefined;
declare const REACT_GRAB_ENABLED: boolean;
declare const REACT_QUERY_DEVTOOLS_ENABLED: boolean;

interface ImportMetaEnv {
    readonly VITE_AI_AGENT_EMBED_URL: string;
    readonly VITE_LOCIZE_PROJECT_ID: string;
    readonly VITE_LOCIZE_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
