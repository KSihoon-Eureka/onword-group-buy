/**
 * POST /api/upload — 이미지 파일을 Supabase Storage `assets` 버킷에 업로드.
 *
 * - FormData multipart, field name = "file"
 * - 인증 사용자 + active store 멤버만 호출 가능 (resolveActiveStore)
 * - service_role 사용 (Storage RLS 정책이 별도로 잡혀있지 않음) → 인증 검증 후 호출
 * - 경로: `products/{storeId}/{timestamp}-{filename}` (PRD §5.5 store_id 코드 레벨 필터 — 경로 격리)
 * - 응답: 200 { url } | 4xx { error } | 500 { error }
 *
 * NOTE: PRD §10.5 crawl_naver_images가 이 fallback을 대체할 예정 (Phase D.5).
 */

import { NextResponse } from 'next/server'
import { resolveActiveStore } from '@/lib/auth/active-store'
import { createServiceClient } from '@onword/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB (PRD §11.1 — 일반 상품 이미지 충분)
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function sanitizeFilename(name: string): string {
  // Supabase Storage key 제약: ASCII 영숫자 + .-_ 만 안전.
  // 공백/한글/특수문자는 'Invalid key' 에러 발생 → 모두 _ 로 치환.
  // 확장자는 보존하고 base 만 sanitize.
  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext = lastDot > 0 ? name.slice(lastDot) : ''
  const cleanedBase = base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  const cleanedExt = ext.replace(/[^a-zA-Z0-9.]/g, '')
  const result = cleanedBase + cleanedExt
  return result.length > 0 ? result : 'upload'
}

export async function POST(request: Request) {
  const active = await resolveActiveStore()
  if (active.type === 'unauthenticated') {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  if (active.type === 'no_active_store' || active.type === 'not_member') {
    return NextResponse.json(
      { error: '매장을 먼저 선택해주세요.' },
      { status: 403 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: '파일을 multipart/form-data로 전송해주세요.' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: '"file" 필드에 파일을 첨부해주세요.' },
      { status: 400 },
    )
  }

  if (file.size === 0) {
    return NextResponse.json({ error: '빈 파일입니다.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: '이미지 크기는 10MB 이하여야 합니다.' },
      { status: 400 },
    )
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: '이미지 형식은 JPG / PNG / WEBP / GIF만 지원합니다.' },
      { status: 400 },
    )
  }

  const safeName = sanitizeFilename(file.name || 'upload')
  const path = `products/${active.storeId}/${Date.now()}-${safeName}`

  const supabase = createServiceClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('assets')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('[/api/upload] upload failed:', uploadError.message)
    return NextResponse.json(
      { error: '이미지 업로드에 실패했습니다.' },
      { status: 500 },
    )
  }

  const { data: pub } = supabase.storage.from('assets').getPublicUrl(path)
  return NextResponse.json({ url: pub.publicUrl, path }, { status: 200 })
}
