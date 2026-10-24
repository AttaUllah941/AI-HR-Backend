import ExcelJS from 'exceljs';

type Cell = string | number | null | undefined;

/** Neutralizes spreadsheet formula injection: text starting with = + - @ tab or CR gets a leading quote. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Build Excel-friendly CSV (UTF-8 BOM). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const escape = (value: Cell) => {
    const raw =
      value === null || value === undefined
        ? ''
        : typeof value === 'number'
          ? String(value)
          : neutralizeFormula(String(value));
    if (/[",\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Build a real .xlsx workbook. Strings are written as plain text values (never as formulas). */
export async function toXlsx(
  sheetName: string,
  headers: string[],
  rows: Cell[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || 'Report');
  sheet.addRow(headers).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(row.map((value) => (typeof value === 'string' ? neutralizeFormula(value) : value ?? null)));
  }
  sheet.columns.forEach((column, index) => {
    const longest = Math.max(
      String(headers[index] ?? '').length,
      ...rows.map((row) => String(row[index] ?? '').length),
    );
    column.width = Math.min(60, Math.max(10, longest + 2));
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

const PDF_LINES_PER_PAGE = 50;

/**
 * Multi-page PDF with Helvetica text lines.
 * Avoids adding a PDF dependency for Phase 12 exports.
 */
export function toSimplePdf(title: string, lines: string[]): Buffer {
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += PDF_LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + PDF_LINES_PER_PAGE));
  }

  // Object layout: 1 catalog, 2 pages, 3 font, then (page, content) pairs from 4.
  const pageObjectId = (index: number) => 4 + index * 2;
  const contentObjectId = (index: number) => 5 + index * 2;

  const objects: string[] = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
  objects.push(
    `2 0 obj<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObjectId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>endobj`,
  );
  objects.push('3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');

  pages.forEach((pageLines, index) => {
    const content: string[] = ['BT', '50 780 Td'];
    if (index === 0) {
      content.push('/F1 16 Tf', `(${escapePdfText(title)}) Tj`, '0 -28 Td');
    } else {
      content.push(`/F1 8 Tf`, `(${escapePdfText(`${title} - page ${index + 1}`)}) Tj`, '0 -22 Td');
    }
    content.push('/F1 10 Tf');
    pageLines.forEach((line, lineIndex) => {
      content.push(`(${escapePdfText(line)}) Tj`);
      if (lineIndex < pageLines.length - 1) content.push('0 -14 Td');
    });
    content.push('ET');
    const stream = content.join('\n');

    objects.push(
      `${pageObjectId(index)} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjectId(index)} 0 R /Resources << /Font << /F1 3 0 R >> >> >>endobj`,
    );
    objects.push(
      `${contentObjectId(index)} 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj`,
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function escapePdfText(value: string): string {
  return value
    .slice(0, 110)
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
