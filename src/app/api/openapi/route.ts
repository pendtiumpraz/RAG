import { NextResponse } from 'next/server';
import { openApiSpec } from '@/modules/core/openapi';

export const runtime = 'nodejs';

/** GET /api/openapi — dokumentasi API (OpenAPI 3.1, publik). */
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
