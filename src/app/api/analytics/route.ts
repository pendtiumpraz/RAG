import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { analyticsService } from '@/modules/chat/analytics.service';
import { susunRentang, awalTampil } from '@/modules/chat/rentang';
import { berbagian, namaBerkas } from '@/modules/core/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics?chatbotId=…&days=30 — analitik SATU chatbot.
 * GET /api/analytics?chatbotId=…&dari=2026-07-01&sampai=2026-07-31
 * GET /api/analytics?…&format=csv — berkas untuk dibawa ke rapat.
 *
 * Per chatbot, bukan per tenant: satu tenant bisa punya banyak chatbot dengan
 * knowledge base yang berbeda, jadi angka gabungan tak bisa ditindaklanjuti.
 * withTenant() di service memastikan chatbot milik tenant lain tak terbaca.
 *
 * CSV memakai SUMBER YANG SAMA dengan JSON, bukan kueri kedua. Dua jalur yang
 * membaca sendiri-sendiri akan menyimpang perlahan, dan yang berbeda justru
 * angka yang dicetak dan dibawa orang ke rapat — versi yang paling sulit
 * dibantah dan paling jarang diperiksa ulang.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const q = req.nextUrl.searchParams;
  const chatbotId = q.get('chatbotId');
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });

  let rentang;
  try {
    rentang = susunRentang(
      { dari: q.get('dari'), sampai: q.get('sampai'), hari: q.get('days') },
      Date.now(),
    );
  } catch (e) {
    // Pesannya sudah ditulis untuk manusia ("Tanggal akhir mendahului tanggal
    // awal"). Melipatnya jadi 400 generik memaksa orang menebak.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const data = await analyticsService.forChatbot(user.tenantId, chatbotId, rentang);
  if (q.get('format') !== 'csv') return NextResponse.json(data);

  const csv = berbagian([
    { judul: `Analitik ${awalTampil(rentang)} s/d ${rentang.akhirTampil} (${rentang.hari} hari)`,
      header: ['Metrik', 'Nilai'],
      isi: [
        ['Percakapan', data.totals.conversations],
        ['Pertanyaan', data.totals.questions],
        ['Jawaban bersitasi', data.totals.withCitation],
        ['Jawaban tanpa sitasi', data.unanswered],
      ] },
    { judul: 'Pertanyaan per hari', header: ['Tanggal', 'Pertanyaan'],
      isi: data.daily.map((d) => [d.day, d.questions]) },
    { judul: 'Pertanyaan terbanyak', header: ['Pertanyaan', 'Jumlah'],
      isi: data.topQuestions.map((r) => [r.question, r.count]) },
    { judul: 'Kata kunci terbanyak', header: ['Kata', 'Jumlah'],
      isi: data.topKeywords.map((r) => [r.word, r.count]) },
    { judul: 'Dokumen paling sering jadi sumber', header: ['Dokumen', 'Dipakai', 'Skor rata-rata'],
      isi: data.topDocuments.map((r) => [r.title ?? r.documentId, r.hits, Number(r.avgScore.toFixed(4))]) },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        `attachment; filename="${namaBerkas('analitik', awalTampil(rentang), rentang.akhirTampil)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
