import { deflateRawSync } from 'node:zlib';
const encoder = new TextEncoder();
function xml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function safeCellText(value) {
    const text = String(value ?? '');
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
function colName(index) {
    let n = index + 1;
    let result = '';
    while (n > 0) {
        const mod = (n - 1) % 26;
        result = String.fromCharCode(65 + mod) + result;
        n = Math.floor((n - 1) / 26);
    }
    return result;
}
function inlineCell(ref, cell) {
    const style = cell.style ?? 0;
    if (cell.type === 'number' && typeof cell.value === 'number' && Number.isFinite(cell.value)) {
        return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
    }
    const text = safeCellText(cell.value ?? '');
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}
function worksheetXml(spec) {
    const rowXml = spec.rows.map((cells, rowIndex) => {
        const r = rowIndex + 1;
        const rendered = cells.map((cell, colIndex) => inlineCell(`${colName(colIndex)}${r}`, cell)).join('');
        const height = r === 1 ? ' ht="30" customHeight="1"' : r === 2 ? ' ht="22" customHeight="1"' : '';
        return `<row r="${r}"${height}>${rendered}</row>`;
    }).join('');
    const cols = spec.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    const maxCols = Math.max(1, ...spec.rows.map((row) => row.length));
    const maxRows = Math.max(1, spec.rows.length);
    const merges = spec.merges?.length ? `<mergeCells count="${spec.merges.length}">${spec.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    const autoFilter = spec.autoFilter ? `<autoFilter ref="${spec.autoFilter}"/>` : '';
    const pane = spec.freezeRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${spec.freezeRow}" topLeftCell="A${spec.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${colName(maxCols - 1)}${maxRows}"/>${pane}<sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rowXml}</sheetData>${autoFilter}${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}
function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode='"R$" #,##0.00'/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts>
<fonts count="4">
<font><sz val="10"/><name val="Aptos"/><color rgb="FF24323C"/></font>
<font><b/><sz val="18"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font>
<font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font>
<font><b/><sz val="10"/><name val="Aptos"/><color rgb="FF0B7698"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B7698"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF103D55"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7F5F9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF5F7FA"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFE2E7EE"/></left><right style="thin"><color rgb="FFE2E7EE"/></right><top style="thin"><color rgb="FFE2E7EE"/></top><bottom style="thin"><color rgb="FFE2E7EE"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFill="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i += 1)
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function le16(value) {
    return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}
function le32(value) {
    return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}
function concat(parts) {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
    }
    return out;
}
function zip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
        const name = encoder.encode(file.name);
        const input = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
        const compressed = deflateRawSync(input);
        const crc = crc32(input);
        const local = concat([
            le32(0x04034b50), le16(20), le16(0x0800), le16(8), le16(0), le16(0), le32(crc), le32(compressed.byteLength), le32(input.byteLength), le16(name.byteLength), le16(0), name, compressed
        ]);
        locals.push(local);
        const central = concat([
            le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(8), le16(0), le16(0), le32(crc), le32(compressed.byteLength), le32(input.byteLength), le16(name.byteLength), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset), name
        ]);
        centrals.push(central);
        offset += local.byteLength;
    }
    const centralBlob = concat(centrals);
    const end = concat([le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(centralBlob.byteLength), le32(offset), le16(0)]);
    return concat([...locals, centralBlob, end]);
}
function formatDateTime(value) {
    if (!value)
        return '';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
function dateBr(value) {
    const [y, m, d] = value.split('-');
    return y && m && d ? `${d}/${m}/${y}` : value;
}
function todaySaoPaulo() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year ?? ''}-${value.month ?? ''}-${value.day ?? ''}`;
}
function reportStatusLabel(report) {
    if (report.status === 'RESPONDED')
        return 'Respondido';
    return todaySaoPaulo() > report.periodEnd ? 'Atrasado' : 'Aguardando';
}
const attendance = { FEW: 'Poucos', HALF: 'Cerca da metade', MOST: 'A maioria', ALL: 'Todos' };
const quality = { POOR: 'Ruim', REGULAR: 'Regular', GOOD: 'Boa', VERY_GOOD: 'Muito boa' };
const contract = { YES: 'Sim', NO: 'Não', NEGOTIATING: 'Ainda estão em negociação' };
const problem = { NO_PROFILE: 'Não tinham direito/perfil', NO_RESPONSE: 'Não responderam', NO_INTEREST: 'Sem interesse', HAS_LAWYER: 'Já tinham advogado', OUTSIDE_REGION: 'Fora da região/público', NONE: 'Nenhum problema relevante', OTHER: 'Outro' };
function titleRows(title, subtitle, columns) {
    const pad = Math.max(1, columns);
    return [
        [{ value: 'MN Insights', style: 1 }, ...Array.from({ length: pad - 1 }, () => ({ value: '', style: 1 }))],
        [{ value: title, style: 2 }, ...Array.from({ length: pad - 1 }, () => ({ value: '', style: 2 }))],
        [{ value: subtitle, style: 6 }, ...Array.from({ length: pad - 1 }, () => ({ value: '', style: 6 }))],
        []
    ];
}
function buildSheets(reports) {
    const scopeTitle = reports.length === 1 ? `${reports[0].clientName} • ${dateBr(reports[0].periodStart)} a ${dateBr(reports[0].periodEnd)}` : `${reports.length} relatórios exportados`;
    const summaryHeaders = ['Cliente', 'Código MN', 'Período', 'Status', 'Teses', 'Investimento total', 'Leads', 'Contratos', 'Respondido em'];
    const summaryData = reports.map((report) => {
        const investment = report.metrics.reduce((sum, metric) => sum + metric.investmentCents, 0) / 100;
        const leads = report.metrics.reduce((sum, metric) => sum + metric.leads, 0);
        const contracts = report.feedbacks.reduce((sum, item) => sum + (item.contractCount ?? 0), 0);
        return [
            { value: report.clientName, style: 4 }, { value: report.clientCode, style: 7 },
            { value: `${dateBr(report.periodStart)} — ${dateBr(report.periodEnd)}`, style: 4 },
            { value: reportStatusLabel(report), style: 4 },
            { value: report.theses.map((item) => item.name).join(' | '), style: 4 },
            { value: investment, style: 5, type: 'number' }, { value: leads, style: 4, type: 'number' },
            { value: contracts, style: 4, type: 'number' }, { value: formatDateTime(report.respondedAt), style: 4 }
        ];
    });
    const summaryRows = [...titleRows('Resumo da exportação', scopeTitle, summaryHeaders.length), summaryHeaders.map((value) => ({ value, style: 3 })), ...summaryData];
    const metricHeaders = ['Cliente', 'Código MN', 'Período', 'Tese', 'Investimento', 'Leads', 'CPL', 'CPC', 'Contratos informados', 'Custo por contrato'];
    const metricRows = reports.flatMap((report) => report.metrics.map((metric) => {
        const feedback = report.feedbacks.find((item) => item.thesisId === metric.thesisId);
        const contracts = feedback?.contractCount ?? 0;
        const costPerContract = contracts > 0 ? metric.investmentCents / 100 / contracts : null;
        return [
            { value: report.clientName, style: 4 }, { value: report.clientCode, style: 7 }, { value: `${dateBr(report.periodStart)} — ${dateBr(report.periodEnd)}`, style: 4 },
            { value: metric.thesisName, style: 4 }, { value: metric.investmentCents / 100, style: 5, type: 'number' },
            { value: metric.leads, style: 4, type: 'number' }, { value: metric.cplCents / 100, style: 5, type: 'number' },
            { value: metric.cpcCents / 100, style: 5, type: 'number' }, { value: contracts, style: 4, type: 'number' },
            costPerContract === null ? { value: '', style: 4 } : { value: costPerContract, style: 5, type: 'number' }
        ];
    }));
    const metrics = [...titleRows('Métricas por tese', scopeTitle, metricHeaders.length), metricHeaders.map((value) => ({ value, style: 3 })), ...metricRows];
    const answerHeaders = ['Cliente', 'Código MN', 'Período', 'Tese', 'Atendimento', 'Qtd. atendidos', 'Qualidade', 'Contrato', 'Qtd. contratos', 'Leads em negociação', 'Problemas', 'Outro problema', 'Observação da campanha', 'Feedback para MN', 'Respondido em'];
    const answerRows = reports.flatMap((report) => report.feedbacks.map((feedback) => [
        { value: report.clientName, style: 4 }, { value: report.clientCode, style: 7 }, { value: `${dateBr(report.periodStart)} — ${dateBr(report.periodEnd)}`, style: 4 },
        { value: feedback.thesisName, style: 4 }, { value: attendance[feedback.attendance] ?? feedback.attendance, style: 4 },
        { value: feedback.attendanceCount ?? '', style: 4, ...(feedback.attendanceCount === null ? {} : { type: 'number' }) },
        { value: quality[feedback.quality] ?? feedback.quality, style: 4 }, { value: contract[feedback.contractStatus] ?? feedback.contractStatus, style: 4 },
        { value: feedback.contractCount ?? '', style: 4, ...(feedback.contractCount === null ? {} : { type: 'number' }) },
        { value: feedback.negotiationCount ?? '', style: 4, ...(feedback.negotiationCount === null ? {} : { type: 'number' }) },
        { value: feedback.problems.map((item) => problem[item] ?? item).join(', '), style: 4 }, { value: feedback.otherProblem ?? '', style: 4 },
        { value: feedback.campaignObservation ?? '', style: 4 }, { value: feedback.agencyFeedback ?? '', style: 4 }, { value: formatDateTime(report.respondedAt), style: 4 }
    ]));
    const answers = [...titleRows('Respostas dos clientes', scopeTitle, answerHeaders.length), answerHeaders.map((value) => ({ value, style: 3 })), ...answerRows];
    return [
        { name: 'Resumo', rows: summaryRows, widths: [28, 12, 24, 18, 36, 18, 10, 12, 20], merges: [`A1:${colName(summaryHeaders.length - 1)}1`, `A2:${colName(summaryHeaders.length - 1)}2`, `A3:${colName(summaryHeaders.length - 1)}3`], autoFilter: `A5:${colName(summaryHeaders.length - 1)}${Math.max(5, summaryRows.length)}`, freezeRow: 5 },
        { name: 'Métricas', rows: metrics, widths: [28, 12, 24, 30, 18, 10, 16, 16, 18, 20], merges: [`A1:${colName(metricHeaders.length - 1)}1`, `A2:${colName(metricHeaders.length - 1)}2`, `A3:${colName(metricHeaders.length - 1)}3`], autoFilter: `A5:${colName(metricHeaders.length - 1)}${Math.max(5, metrics.length)}`, freezeRow: 5 },
        { name: 'Respostas', rows: answers, widths: [28, 12, 24, 30, 20, 14, 18, 25, 14, 18, 38, 38, 48, 48, 20], merges: [`A1:${colName(answerHeaders.length - 1)}1`, `A2:${colName(answerHeaders.length - 1)}2`, `A3:${colName(answerHeaders.length - 1)}3`], autoFilter: `A5:${colName(answerHeaders.length - 1)}${Math.max(5, answers.length)}`, freezeRow: 5 }
    ];
}
export function buildReportsXlsx(reports) {
    const sheets = buildSheets(reports);
    const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    const rels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
    const types = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const files = [
        { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${types}</Types>` },
        { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
        { name: 'xl/styles.xml', content: stylesXml() }
    ];
    sheets.forEach((sheet, index) => files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet) }));
    return zip(files);
}
export function exportFilename(reports) {
    const clean = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    if (reports.length === 1) {
        const report = reports[0];
        return `MN_Insights_${clean(report.clientName)}_${report.periodStart}_${report.periodEnd}.xlsx`;
    }
    const date = new Date().toISOString().slice(0, 10);
    return `MN_Insights_Relatorios_${date}.xlsx`;
}
//# sourceMappingURL=xlsx.js.map