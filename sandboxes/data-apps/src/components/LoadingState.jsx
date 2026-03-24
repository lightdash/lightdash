export function LoadingState({ message = 'Loading...' }) {
    return (
        <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-zinc-400">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-red-500" />
                <span className="text-sm">{message}</span>
            </div>
        </div>
    );
}

export function ErrorState({ error }) {
    return (
        <div className="flex items-center justify-center py-12">
            <p className="text-sm text-red-400">Error: {error?.message || 'Something went wrong'}</p>
        </div>
    );
}
