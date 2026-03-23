// Vite env type augmentation so import.meta.env compiles.
// At build time Vite replaces these with literal values.
interface ImportMetaEnv {
    readonly VITE_LIGHTDASH_API_KEY?: string;
    readonly VITE_LIGHTDASH_URL?: string;
    readonly VITE_LIGHTDASH_PROJECT_UUID?: string;
}

interface ImportMeta {
    readonly env?: ImportMetaEnv;
}
