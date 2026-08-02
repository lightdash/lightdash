# Client-side PDF downloads (html-to-image + jspdf)

> Read this for PDF Report templates or whenever the user asks for a PDF download.

For PDF Report templates, or whenever the user asks for a PDF download, use the pre-installed `html-to-image` and `jspdf` packages. Do not load PDF libraries from a CDN or ask to install packages.

PDF downloads are image-based: they preserve the visible report exactly, but the exported text is not selectable/searchable. Keep `window.print()` only as a secondary Print action if useful; the Download PDF button should save a file directly.

Rules:

- Render each PDF page or section in a stable DOM container, e.g. `.pdf-page`, with fixed printable dimensions or aspect ratio.
- Include a Download PDF button in the report toolbar/header.
- Track `isExportingPdf`, disable the button while report data is loading or PDF generation is running, and show a spinner or "Exporting..." label until the promise settles.
- Use chart value labels in PDF reports because exported pages cannot be hovered.
- Avoid capturing scroll containers with hidden content. Capture page-sized elements that already contain the full content intended for export.

```tsx
import { Button } from '@/components/ui/button';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Download, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';

async function imageLoaded(src: string) {
    const image = new Image();
    image.src = src;
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
    });
    return image;
}

async function downloadPdfFromPages(
    pages: HTMLElement[],
    filename = 'report.pdf',
) {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let index = 0; index < pages.length; index += 1) {
        if (index > 0) pdf.addPage();

        const dataUrl = await toPng(pages[index], {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor: '#ffffff',
        });
        const image = await imageLoaded(dataUrl);
        const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;

        pdf.addImage(dataUrl, 'PNG', (pageWidth - width) / 2, 0, width, height);
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function PdfReport() {
    const reportRef = useRef<HTMLDivElement | null>(null);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    async function exportPdf() {
        if (!reportRef.current) return;
        setIsExportingPdf(true);
        try {
            const pages = Array.from(
                reportRef.current.querySelectorAll<HTMLElement>('.pdf-page'),
            );
            await downloadPdfFromPages(
                pages.length > 0 ? pages : [reportRef.current],
                'executive-report.pdf',
            );
        } finally {
            setIsExportingPdf(false);
        }
    }

    return (
        <>
            <Button disabled={isExportingPdf} onClick={exportPdf}>
                {isExportingPdf ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Download className="mr-2 h-4 w-4" />
                )}
                {isExportingPdf ? 'Exporting...' : 'Download PDF'}
            </Button>
            <div ref={reportRef}>{/* .pdf-page report sections */}</div>
        </>
    );
}
```
