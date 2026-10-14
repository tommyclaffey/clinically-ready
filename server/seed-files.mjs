// Placeholder file generators for the seed: a valid one-page PDF and valid (stored) ZIP/DOCX,
// padded to a target size so the library shows realistic sizes like "2.4 MB".
import { crc32 } from 'node:zlib';

const pdfEscape = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** One-page PDF with a title and a few lines of text, padded with comment lines. */
export function makePdf(title, lines, targetBytes = 0) {
  const text = [
    'BT /F1 20 Tf 72 720 Td',
    `(${pdfEscape(title)}) Tj`,
    '/F1 12 Tf 0 -32 Td',
    ...lines.flatMap((l) => [`(${pdfEscape(l)}) Tj`, '0 -18 Td']),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  const build = (padding) => {
    let out = `%PDF-1.4\n${padding}`;
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(out));
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out);
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  };
  const base = Buffer.byteLength(build(''));
  return Buffer.from(build(padComment('%', Math.max(0, targetBytes - base))));
}

/** `n` bytes of comment lines, each starting with `prefix`. */
function padComment(prefix, n) {
  if (n <= 0) return '';
  const line = `${prefix} placeholder padding ${'.'.repeat(60)}\n`;
  let out = line.repeat(Math.floor(n / line.length));
  const rest = n - out.length;
  if (rest > 0) out += rest === 1 ? '\n' : `${prefix}${'.'.repeat(rest - 2)}\n`;
  return out;
}

/** Uncompressed ("stored") ZIP archive from [{ name, data }]. */
export function makeZip(entries) {
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name);
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const xmlEscape = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

/** Minimal Word document with one paragraph per line, padded with an XML comment. */
export function makeDocx(title, lines, targetBytes = 0) {
  const paras = [title, ...lines].map((l) => `<w:p><w:r><w:t>${xmlEscape(l)}</w:t></w:r></w:p>`).join('');
  const parts = (padding) => [
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/document.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        (padding ? `<!--${padding}-->` : '') +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`,
    },
  ];
  const base = makeZip(parts('')).length + 7; // 7 = "<!--" + "-->"
  const pad = Math.max(0, targetBytes - base);
  return makeZip(parts(pad ? ' '.repeat(pad) : ''));
}

/** ZIP with a readme and a padding text file. */
export function makeZipKit(readme, targetBytes = 0) {
  const base = makeZip([{ name: 'README.txt', data: readme }, { name: 'placeholder.txt', data: '' }]).length;
  const pad = Math.max(0, targetBytes - base);
  return makeZip([
    { name: 'README.txt', data: readme },
    { name: 'placeholder.txt', data: padComment('#', pad) },
  ]);
}
