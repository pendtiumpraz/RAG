import type { Deck, Slide } from './decks';

/**
 * Ekspor PPTX — dibangun dari MODEL DATA yang sama dengan renderer DOM,
 * jadi isi PPTX tak pernah menyimpang dari yang tampil di layar.
 * pptxgenjs di-import dinamis: ±400KB hanya dimuat saat tombolnya ditekan.
 */

// palet brand (nalar-ds): Deep Navy / Royal Blue / Amber / Slate
const NAVY = '0F172A';
const BLUE = '2563EB';
const AMBER = 'B45309';
const INK = '0F172A';
const MUTED = '475569';
const LINE = 'D8E0EA';
const CARD = 'F8FAFC';

export async function exportPptx(deck: Deck): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'Nalar';
  pptx.title = `Nalar — ${deck.label}`;

  for (const s of deck.slides) addSlide(pptx, s);
  await pptx.writeFile({ fileName: `nalar-${deck.id}-deck.pptx` });
}

type Pptx = InstanceType<Awaited<typeof import('pptxgenjs')>['default']>;

function addSlide(pptx: Pptx, s: Slide): void {
  const sl = pptx.addSlide();

  if (s.kind === 'cover' || s.kind === 'closing') {
    sl.background = { color: NAVY };
    if (s.kind === 'cover') {
      sl.addText(s.kicker, { x: 0.9, y: 1.6, w: 11.5, h: 0.4, fontSize: 12, color: '93C5FD', fontFace: 'Consolas', charSpacing: 3 });
    }
    sl.addText(s.title, { x: 0.85, y: s.kind === 'cover' ? 2.1 : 2.4, w: 11.6, h: 1.6, fontSize: s.kind === 'cover' ? 66 : 44, bold: true, color: 'FFFFFF' });
    sl.addText(s.subtitle, { x: 0.9, y: s.kind === 'cover' ? 3.9 : 4.1, w: 9.5, h: 1.2, fontSize: 18, color: 'CBD5E1' });
    sl.addText(s.foot, { x: 0.9, y: 6.7, w: 11.5, h: 0.4, fontSize: 11, color: '64748B', fontFace: 'Consolas' });
    sl.addShape('rect', { x: 0.9, y: 3.75, w: 1.4, h: 0.035, fill: { color: BLUE } });
    return;
  }

  // header umum: kicker + title + garis
  sl.background = { color: 'FFFFFF' };
  sl.addText(s.kicker, { x: 0.75, y: 0.5, w: 11.8, h: 0.35, fontSize: 11, color: BLUE, fontFace: 'Consolas', charSpacing: 3 });
  sl.addText(s.title, { x: 0.7, y: 0.85, w: 11.9, h: 0.8, fontSize: 26, bold: true, color: INK });
  sl.addShape('rect', { x: 0.75, y: 1.72, w: 11.83, h: 0.015, fill: { color: LINE } });
  const noteY = 6.75;
  const note = 'note' in s ? s.note : undefined;
  if (note) sl.addText(note, { x: 0.75, y: noteY, w: 11.8, h: 0.55, fontSize: 10.5, italic: true, color: MUTED });

  if (s.kind === 'bullets') {
    sl.addText(s.bullets.map((b) => ({ text: b, options: { bullet: { code: '2022', indent: 14 }, breakLine: true, paraSpaceAfter: 12 } })),
      { x: 1.0, y: 2.1, w: 11.2, h: 4.4, fontSize: 17, color: INK, valign: 'top' });
    return;
  }

  if (s.kind === 'twocol') {
    const w = 5.75;
    s.cols.forEach((c, i) => {
      const x = 0.75 + i * (w + 0.35);
      sl.addShape('roundRect', { x, y: 2.0, w, h: 4.5, rectRadius: 0.08, fill: { color: CARD }, line: { color: LINE, width: 1 } });
      sl.addText(c.h, { x: x + 0.25, y: 2.2, w: w - 0.5, h: 0.45, fontSize: 15, bold: true, color: BLUE });
      sl.addText(c.bullets.map((b) => ({ text: b, options: { bullet: { code: '2022', indent: 10 }, breakLine: true, paraSpaceAfter: 8 } })),
        { x: x + 0.25, y: 2.75, w: w - 0.5, h: 3.5, fontSize: 12.5, color: INK, valign: 'top' });
    });
    return;
  }

  if (s.kind === 'stats') {
    const n = s.stats.length; const w = (11.85 - (n - 1) * 0.3) / n;
    s.stats.forEach((st, i) => {
      const x = 0.75 + i * (w + 0.3);
      sl.addShape('roundRect', { x, y: 2.2, w, h: 3.4, rectRadius: 0.08, fill: { color: CARD }, line: { color: LINE, width: 1 } });
      sl.addText(st.v, { x: x + 0.15, y: 2.6, w: w - 0.3, h: 0.9, fontSize: 30, bold: true, color: BLUE, align: 'center' });
      sl.addText(st.l.toUpperCase(), { x: x + 0.15, y: 3.6, w: w - 0.3, h: 0.5, fontSize: 10.5, color: MUTED, align: 'center', fontFace: 'Consolas' });
      if (st.n) sl.addText(st.n, { x: x + 0.2, y: 4.2, w: w - 0.4, h: 1.1, fontSize: 10, color: MUTED, align: 'center' });
    });
    return;
  }

  if (s.kind === 'flow') {
    const n = s.steps.length; const w = (11.85 - (n - 1) * 0.55) / n;
    s.steps.forEach((st, i) => {
      const x = 0.75 + i * (w + 0.55);
      sl.addShape('roundRect', { x, y: 2.6, w, h: 2.3, rectRadius: 0.08, fill: { color: CARD }, line: { color: LINE, width: 1 } });
      sl.addText(String(i + 1), { x: x + 0.18, y: 2.78, w: 0.5, h: 0.4, fontSize: 14, bold: true, color: BLUE, fontFace: 'Consolas' });
      sl.addText(st.t, { x: x + 0.18, y: 3.2, w: w - 0.36, h: 0.7, fontSize: 13.5, bold: true, color: INK });
      if (st.d) sl.addText(st.d, { x: x + 0.18, y: 3.9, w: w - 0.36, h: 0.9, fontSize: 10, color: MUTED });
      if (i < n - 1) sl.addText('→', { x: x + w + 0.05, y: 3.4, w: 0.5, h: 0.5, fontSize: 18, color: AMBER, align: 'center' });
    });
    return;
  }

  if (s.kind === 'table') {
    const rows = [
      s.headers.map((h) => ({ text: h, options: { bold: true, color: MUTED, fontSize: s.small ? 9.5 : 11, fontFace: 'Consolas', fill: { color: CARD } } })),
      ...s.rows.map((r) => r.map((c) => ({ text: c, options: { fontSize: s.small ? 9.5 : 11.5, color: INK } }))),
    ];
    sl.addTable(rows, {
      x: 0.75, y: 2.0, w: 11.83,
      border: { type: 'solid', color: LINE, pt: 0.75 },
      rowH: s.small ? 0.28 : 0.42, valign: 'middle', margin: 0.06,
    });
    return;
  }
}
