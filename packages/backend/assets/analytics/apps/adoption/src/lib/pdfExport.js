/**
 * Lets the host (scheduled deliveries, headless renders) request the same
 * PDF the app's Download PDF button produces. The app registers a builder
 * that resolves to a Blob; the host asks for it over the sandbox bridge.
 *
 * Mirrors the screenshot handshake in `screenshotHandler.js`: availability
 * is announced so the parent knows the app is report-shaped, and only the
 * finished Blob crosses the sandbox boundary — never HTML. The announce
 * happens on register (not boot) because only apps with a PDF report have
 * anything to export; hosts must therefore listen before the app mounts.
 */

const REQUEST_TYPE = 'lightdash:sdk:pdf-export-request';
const RESPONSE_TYPE = 'lightdash:sdk:pdf-export-response';
const AVAILABLE_TYPE = 'lightdash:sdk:pdf-export-available';

let exporter = null;

/**
 * Register the app's PDF builder. Call once on app mount with a function
 * that builds the report PDF from the current DOM and resolves to a Blob
 * (`pdf.output('blob')`) — the same builder the Download PDF button uses,
 * minus the `.save()`. Re-registering replaces the previous builder.
 */
export function registerPdfExport(buildPdfBlob) {
    exporter = typeof buildPdfBlob === 'function' ? buildPdfBlob : null;
    if (exporter && typeof window !== 'undefined') {
        window.parent.postMessage({ type: AVAILABLE_TYPE }, '*');
    }
}

export function initPdfExportHandler() {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', async (event) => {
        const { data } = event;
        if (data?.type !== REQUEST_TYPE) return;

        const { id } = data;
        try {
            if (!exporter) {
                throw new Error('This app has no PDF export registered');
            }
            const blob = await exporter();
            if (!(blob instanceof Blob)) {
                throw new Error('PDF exporter must resolve to a Blob');
            }
            window.parent.postMessage({ type: RESPONSE_TYPE, id, blob }, '*');
        } catch (err) {
            window.parent.postMessage(
                {
                    type: RESPONSE_TYPE,
                    id,
                    error:
                        err instanceof Error ? err.message : 'PDF export failed',
                },
                '*',
            );
        }
    });
}
