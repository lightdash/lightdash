/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare const __APP_VERSION__: string;
declare const REACT_SCAN_ENABLED: boolean;
declare const REACT_GRAB_ENABLED: boolean;
declare const REACT_QUERY_DEVTOOLS_ENABLED: boolean;
declare const ECHARTS_V6_ENABLED: boolean;

declare module '*.module.css' {
    const classes: { readonly [key: string]: string };
    export default classes;
}
