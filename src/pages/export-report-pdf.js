import { jsx as _jsx } from "react/jsx-runtime";
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { createRoot } from 'react-dom/client';
import { ReportPrint } from './report-print';
const PAGE_WIDTH = 1123;
export function downloadChartReportPdf(props, filename) {
    return downloadReportPdf(_jsx(ReportPrint, { ...props }), filename);
}
export async function downloadReportPdf(sheetElement, filename) {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = `${PAGE_WIDTH}px`;
    host.style.zIndex = '-1';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
        root.render(sheetElement);
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const images = [...host.querySelectorAll('img')];
        await Promise.all(images.map((img) => img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = () => resolve(null);
                img.onerror = () => resolve(null);
            })));
        const sheet = host.querySelector('.report-print');
        if (!(sheet instanceof HTMLElement))
            throw new Error('Report sheet did not render.');
        const canvas = await html2canvas(sheet, {
            scale: 2,
            backgroundColor: '#f4f3ef',
            useCORS: true,
            width: PAGE_WIDTH,
            windowWidth: PAGE_WIDTH,
        });
        const pageWidth = 841.89;
        const fullPageHeight = 1190.55;
        const contentHeight = (canvas.height / canvas.width) * pageWidth;
        const pages = [];
        let remaining = contentHeight;
        while (remaining > 0.5) {
            const height = Math.min(fullPageHeight, remaining);
            pages.push(height);
            remaining -= height;
        }
        let pdf = null;
        let offset = 0;
        for (const height of pages) {
            pdf = addSheetPage(pdf, pageWidth, height);
            const sliceHeight = Math.min(Math.round(canvas.width * (height / pageWidth)), canvas.height - offset);
            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = sliceHeight;
            const context = slice.getContext('2d');
            if (!context)
                throw new Error('Could not draw the report page.');
            context.fillStyle = '#f4f3ef';
            context.fillRect(0, 0, slice.width, slice.height);
            context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
            pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, (sliceHeight / canvas.width) * pageWidth);
            offset += sliceHeight;
        }
        if (!pdf)
            throw new Error('Report sheet did not render.');
        addBrandLink(pdf, sheet, pageWidth, pages);
        pdf.save(filename);
    }
    finally {
        root.unmount();
        host.remove();
    }
}
function addSheetPage(pdf, width, height) {
    const orientation = height >= width ? 'portrait' : 'landscape';
    if (!pdf)
        return new jsPDF({ unit: 'pt', format: [width, height], orientation });
    pdf.addPage([width, height], orientation);
    return pdf;
}
function addBrandLink(pdf, sheet, pageWidth, pages) {
    const brands = [...sheet.querySelectorAll('[data-pdf-link]')].filter((node) => node instanceof HTMLElement);
    if (brands.length === 0)
        return;
    const sheetBox = sheet.getBoundingClientRect();
    const scale = pageWidth / sheetBox.width;
    for (const brand of brands) {
        const brandBox = brand.getBoundingClientRect();
        const y = (brandBox.top - sheetBox.top) * scale;
        let top = 0;
        let pageIndex = 0;
        for (let index = 0; index < pages.length; index += 1) {
            if (y < top + pages[index] - 0.5) {
                pageIndex = index;
                break;
            }
            top += pages[index];
        }
        pdf.setPage(pageIndex + 1);
        pdf.link((brandBox.left - sheetBox.left) * scale, y - top, brandBox.width * scale, brandBox.height * scale, { url: 'https://miravize.com' });
    }
}
