import 'i18next';

// Keys are untyped on purpose: namespaces are glob-loaded so there is no
// static import to derive them from (see README.md).
declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'common';
        returnNull: false;
    }
}
