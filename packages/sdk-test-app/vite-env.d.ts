/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_LOCIZE_PROJECT_ID: string;
    readonly VITE_LOCIZE_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
