/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_AI_AGENT_EMBED_URL: string;
    readonly VITE_FULL_APP_EMBED_URL: string;
    readonly VITE_LOCIZE_PROJECT_ID: string;
    readonly VITE_LOCIZE_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
