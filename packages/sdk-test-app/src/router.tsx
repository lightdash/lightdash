import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

type NavigateOptions = {
    replace?: boolean;
};

type RouterContextValue = {
    createHref: (path: string) => string;
    currentPath: string;
    navigate: (path: string, options?: NavigateOptions) => void;
};

type RouterProviderProps = {
    children: ReactNode;
};

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
};

const RouterContext = createContext<RouterContextValue | null>(null);

const normalizePath = (path: string) => {
    const trimmedPath = path.trim();

    if (!trimmedPath || trimmedPath === '#') {
        return '/';
    }

    const withoutHash = trimmedPath.startsWith('#')
        ? trimmedPath.slice(1)
        : trimmedPath;
    const withoutQuery = withoutHash.split('?')[0] || '/';
    const withoutTrailingSlash =
        withoutQuery.length > 1 && withoutQuery.endsWith('/')
            ? withoutQuery.slice(0, -1)
            : withoutQuery;

    return withoutTrailingSlash.startsWith('/')
        ? withoutTrailingSlash
        : `/${withoutTrailingSlash}`;
};

const getBrowserPath = () => {
    if (typeof window === 'undefined') {
        return '/';
    }

    if (window.location.hash) {
        return normalizePath(window.location.hash);
    }

    return normalizePath(window.location.pathname);
};

const createHashHref = (path: string) => `#${normalizePath(path)}`;

const isPlainLeftClick = (event: MouseEvent<HTMLAnchorElement>) =>
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey;

export function RouterProvider({ children }: RouterProviderProps) {
    const [currentPath, setCurrentPath] = useState(getBrowserPath);

    useEffect(() => {
        const syncPath = () => {
            setCurrentPath(getBrowserPath());
        };

        window.addEventListener('hashchange', syncPath);
        window.addEventListener('popstate', syncPath);

        return () => {
            window.removeEventListener('hashchange', syncPath);
            window.removeEventListener('popstate', syncPath);
        };
    }, []);

    const value = useMemo<RouterContextValue>(
        () => ({
            currentPath,
            createHref: createHashHref,
            navigate: (path, options) => {
                const nextPath = normalizePath(path);

                setCurrentPath(nextPath);

                if (typeof window === 'undefined') {
                    return;
                }

                const nextUrl = `${window.location.pathname}${window.location.search}${createHashHref(
                    nextPath,
                )}`;

                if (options?.replace) {
                    window.history.replaceState(null, '', nextUrl);
                    return;
                }

                window.history.pushState(null, '', nextUrl);
            },
        }),
        [currentPath],
    );

    return (
        <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
    );
}

export function useRouter() {
    const context = useContext(RouterContext);

    if (!context) {
        throw new Error('Router context is not available');
    }

    return context;
}

export function Link({
    href,
    onClick,
    target,
    rel,
    ...props
}: LinkProps) {
    const { createHref, navigate } = useRouter();

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);

        if (
            event.defaultPrevented ||
            !isPlainLeftClick(event) ||
            (target && target !== '_self') ||
            rel === 'external'
        ) {
            return;
        }

        event.preventDefault();
        navigate(href);
    };

    return (
        <a
            {...props}
            href={createHref(href)}
            onClick={handleClick}
            rel={rel}
            target={target}
        />
    );
}
