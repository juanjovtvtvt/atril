import JSZip from 'jszip';
import type { Chapter } from './pdfToEpub';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const chapterFile = (i: number) => `chap-${String(i + 1).padStart(3, '0')}.xhtml`;

const css = `body { font-family: serif; line-height: 1.55; margin: 0 4%; }
h1 { font-size: 1.5em; line-height: 1.25; margin: 1.2em 0 0.8em; }
h2 { font-size: 1.2em; line-height: 1.3; margin: 1.4em 0 0.6em; }
p { margin: 0 0 0.85em; }
`;

function chapterXhtml(chapter: Chapter, lang: string) {
  const body = chapter.blocks
    .map((b) => (b.kind === 'p' ? `<p>${esc(b.text)}</p>` : `<${b.kind}>${esc(b.text)}</${b.kind}>`))
    .join('\n');
  const heading = chapter.blocks[0]?.kind === 'h1' || chapter.blocks[0]?.kind === 'h2' ? '' : `<h1>${esc(chapter.title)}</h1>\n`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>${esc(chapter.title)}</title><link rel="stylesheet" href="style.css"/></head>
<body><section epub:type="chapter">
${heading}${body}
</section></body>
</html>`;
}

export async function buildEpub(opts: { title: string; author: string; language?: string; chapters: Chapter[] }) {
  const lang = opts.language || 'es';
  const id = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const zip = new JSZip();

  // The spec requires "mimetype" to be the first entry and uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  const manifest = opts.chapters.map((_, i) => `<item id="c${i + 1}" href="${chapterFile(i)}" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = opts.chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${id}</dc:identifier>
<dc:title>${esc(opts.title)}</dc:title>
<dc:creator>${esc(opts.author)}</dc:creator>
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${manifest}
</manifest>
<spine toc="ncx">
${spine}
</spine>
</package>`,
  );

  const navItems = opts.chapters.map((c, i) => `<li><a href="${chapterFile(i)}">${esc(c.title)}</a></li>`).join('\n');
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>Índice</title></head>
<body><nav epub:type="toc" id="toc"><h1>Índice</h1><ol>
${navItems}
</ol></nav></body>
</html>`,
  );

  // toc.ncx keeps older EPUB 2 readers happy.
  const navPoints = opts.chapters
    .map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${chapterFile(i)}"/></navPoint>`)
    .join('\n');
  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${id}"/></head>
<docTitle><text>${esc(opts.title)}</text></docTitle>
<navMap>
${navPoints}
</navMap>
</ncx>`,
  );

  zip.file('OEBPS/style.css', css);
  opts.chapters.forEach((c, i) => zip.file(`OEBPS/${chapterFile(i)}`, chapterXhtml(c, lang)));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}
