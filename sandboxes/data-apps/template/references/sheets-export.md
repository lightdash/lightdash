# Google Sheets export (`exportToSheets`)

> Read this when the user wants an "Open in Google Sheets" action or any export destined for Google Sheets.

Use `exportToSheets()` when the user wants a one-click "Open in Google Sheets" button or otherwise needs the data to land in a new Google spreadsheet they own. It takes the in-memory rows the app already has and creates a new sheet against the viewer's connected Google account.

`exportToSheets` is a top-level export from the SDK, not a `useLightdash` field — it isn't tied to a single query:

```tsx
import { exportToSheets } from '@lightdash/query-sdk';
```

When to use it vs `downloadResults`:

- **`exportToSheets`** writes the rows you pass in to a *new Google Sheet*. The rows can be anything the app has produced — query results, joined/aggregated combinations of multiple queries, locally filtered subsets, computed columns. Use this when the data the user wants exported only exists in the React layer, or when the destination is Sheets specifically.
- **`downloadResults`** re-runs the underlying Lightdash query server-side and produces a CSV/XLSX file. Use this when the user wants raw query results matching the warehouse, not a React-transformed view.

If both fit (a straight `useLightdash(query)` table with no client transforms, and the user just wants "send to Sheets"), prefer `exportToSheets` for the Sheets case and `downloadResults` for CSV/XLSX.

```tsx
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';
import { exportToSheets } from '@lightdash/query-sdk';
import { useState } from 'react';

function ExportToSheetsButton() {
    const { data, columns, loading } = useLightdash(revenueQuery);
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            const { fileUrl } = await exportToSheets({
                title: 'Revenue by segment',
                columns: columns.map((c) => ({
                    key: c.name,
                    label: c.label,
                    type: c.type,
                })),
                rows: data,
            });
            window.open(fileUrl, '_blank');
        } catch (err) {
            // Show a toast in real app code. Common messages:
            //  "Google Sheets export is not available in this context"
            //     — running inside an embed; fall back to downloadResults.
            //  "Google authentication was cancelled" — user closed OAuth popup.
            //  "Export too large (max 100,000 rows / 25 MB)" — dataset too big.
            console.error(err);
        } finally {
            setExporting(false);
        }
    };

    const disabled = loading || exporting || data.length === 0;

    return (
        <Button variant="outline" size="sm" disabled={disabled} onClick={handleExport}>
            {exporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
                <ExternalLink className="h-4 w-4 mr-1" />
            )}
            {exporting ? 'Exporting…' : 'Open in Google Sheets'}
        </Button>
    );
}
```

Options:
- `title`: spreadsheet name shown in Google Drive.
- `columns`: ordered column definitions. `key` matches the row object key; optional `label` overrides the header text (defaults to `key`); optional `type` (`'string' | 'number' | 'date' | 'timestamp' | 'boolean'`) lets the backend format cells correctly.
- `rows`: an array of plain objects keyed by the column `key`s. Values must be `string | number | boolean | null`.

Returns `{ fileUrl }` — open it in a new tab to drop the user into the sheet.

OAuth behavior:
- If the viewer is signed into Lightdash but hasn't connected Google yet, the parent frame opens the standard Google OAuth popup automatically — `exportToSheets` awaits consent and then proceeds. Don't try to open the popup yourself; the iframe sandbox blocks it.

Where it works:
- First-party Lightdash sessions only (the app surfaces inside Lightdash's own UI and dashboard tiles).
- **Not** available in JWT/public embed contexts. The promise rejects with `"Google Sheets export is not available in this context"`. Surface this as a clear toast and fall back to `downloadResults` if the same app may also render inside an embed.

Rules:
- Only call from explicit user actions such as a button or menu item.
- Disable the button while exporting and when `data.length === 0`.
- Track export state (`exporting`, `isExporting`, etc.) and show a spinner or "Exporting…" label until the promise settles.
- After success, open the returned `fileUrl` in a new tab. Don't try to render Google Sheets inside the app iframe — embedded sheets need third-party cookies the sandbox blocks.
- Hard limits: 100,000 rows and 25 MB serialized payload. If you can tell upfront the dataset will exceed either, disable the button with an explanatory tooltip.
