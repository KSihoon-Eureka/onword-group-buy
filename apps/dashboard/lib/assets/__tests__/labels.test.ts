import { describe, it, expect } from 'vitest'
import {
  getAssetCategory,
  getAssetTypeLabel,
  truncatePreview,
  formatAssetCreatedAt,
  getDownloadFilename,
  getCategoryLabel,
} from '../labels'

describe('getAssetCategory', () => {
  it('텍스트 자산은 text', () => {
    expect(getAssetCategory('announcement_stage1')).toBe('text')
    expect(getAssetCategory('announcement_stage2')).toBe('text')
    expect(getAssetCategory('announcement_stage3')).toBe('text')
    expect(getAssetCategory('price_emphasis_text')).toBe('text')
    expect(getAssetCategory('pickup_table_text')).toBe('text')
    expect(getAssetCategory('wholesale_email')).toBe('text')
    expect(getAssetCategory('price_compare_data')).toBe('text')
  })

  it('이미지 자산은 image', () => {
    expect(getAssetCategory('poster')).toBe('image')
    expect(getAssetCategory('pickup_table_image')).toBe('image')
    expect(getAssetCategory('product_image')).toBe('image')
    expect(getAssetCategory('price_compare_image')).toBe('image')
  })

  it('알 수 없는 타입은 text fallback', () => {
    expect(getAssetCategory('unknown_type')).toBe('text')
  })
})

describe('getAssetTypeLabel', () => {
  it('각 AssetType 에 한국어 라벨', () => {
    expect(getAssetTypeLabel('announcement_stage1')).toBe('공고① (시작)')
    expect(getAssetTypeLabel('poster')).toBe('포스터')
    expect(getAssetTypeLabel('wholesale_email')).toBe('도매 이메일')
  })

  it('알 수 없는 타입은 원본 반환', () => {
    expect(getAssetTypeLabel('foo_bar')).toBe('foo_bar')
  })
})

describe('getCategoryLabel', () => {
  it('text → 텍스트, image → 이미지', () => {
    expect(getCategoryLabel('text')).toBe('텍스트')
    expect(getCategoryLabel('image')).toBe('이미지')
  })
})

describe('truncatePreview', () => {
  it('null/빈 문자열은 빈 문자열', () => {
    expect(truncatePreview(null)).toBe('')
    expect(truncatePreview('')).toBe('')
    expect(truncatePreview('   ')).toBe('')
  })

  it('maxLength 이하는 trim 만', () => {
    expect(truncatePreview('  안녕  ')).toBe('안녕')
  })

  it('maxLength 초과는 잘라내고 ellipsis 추가', () => {
    const long = 'a'.repeat(120)
    const result = truncatePreview(long, 100)
    expect(result).toHaveLength(101) // 100 + '…'
    expect(result.endsWith('…')).toBe(true)
  })

  it('기본 maxLength 는 100', () => {
    const long = 'b'.repeat(150)
    expect(truncatePreview(long).length).toBe(101)
  })
})

describe('formatAssetCreatedAt', () => {
  it('MM월 DD일(요일) 오전/오후 H:MM 형식 (오전)', () => {
    // 2026-05-14 09:05 KST 가 아닌 로컬 영향 받으므로 UTC 명시 후
    // 실행 환경 timezone 이 KST 가 아닐 수 있어 결과를 새로 계산.
    const iso = '2026-05-14T09:05:00.000Z'
    const d = new Date(iso)
    const expectedMonth = String(d.getMonth() + 1).padStart(2, '0')
    const expectedDay = String(d.getDate()).padStart(2, '0')
    const expectedWeekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
    const h = d.getHours()
    const period = h < 12 ? '오전' : '오후'
    const h12 = h % 12 === 0 ? 12 : h % 12
    const min = String(d.getMinutes()).padStart(2, '0')

    expect(formatAssetCreatedAt(iso)).toBe(
      `${expectedMonth}월 ${expectedDay}일(${expectedWeekday}) ${period} ${h12}:${min}`,
    )
  })

  it('자정 (0시) 은 오전 12 로 표기', () => {
    // 임의 timezone 에서 자정이 떨어지는 ISO 를 직접 만들 수 없으므로
    // Date 객체를 직접 만들어 검증한다.
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const result = formatAssetCreatedAt(d.toISOString())
    expect(result).toContain('오전 12:00')
  })

  it('정오 (12시) 는 오후 12 로 표기', () => {
    const d = new Date()
    d.setHours(12, 30, 0, 0)
    const result = formatAssetCreatedAt(d.toISOString())
    expect(result).toContain('오후 12:30')
  })

  it('잘못된 ISO 는 원본 반환', () => {
    expect(formatAssetCreatedAt('not-a-date')).toBe('not-a-date')
  })
})

describe('getDownloadFilename', () => {
  it('URL 마지막 segment 추출', () => {
    expect(
      getDownloadFilename({
        assetUrl: 'https://supabase.example.com/storage/assets/poster_abc.png',
        type: 'poster',
        id: '11111111-2222-3333-4444-555555555555',
      }),
    ).toBe('poster_abc.png')
  })

  it('쿼리스트링 제거', () => {
    expect(
      getDownloadFilename({
        assetUrl: 'https://x.com/path/img.jpg?token=abc',
        type: 'poster',
        id: 'id-1',
      }),
    ).toBe('img.jpg')
  })

  it('URL 파싱 실패 시 path fallback', () => {
    expect(
      getDownloadFilename({
        assetUrl: '/relative/path/file.png?x=1',
        type: 'poster',
        id: 'id-1',
      }),
    ).toBe('file.png')
  })

  it('assetUrl null 이면 type + id 단축형', () => {
    expect(
      getDownloadFilename({
        assetUrl: null,
        type: 'pickup_table_image',
        id: 'abcdef12-3456-7890-abcd-ef1234567890',
      }),
    ).toBe('pickup_table_image-abcdef12')
  })

  it('URL encoded segment 는 decode', () => {
    expect(
      getDownloadFilename({
        assetUrl: 'https://x.com/storage/%ED%8F%AC%EC%8A%A4%ED%84%B0.png',
        type: 'poster',
        id: 'id-1',
      }),
    ).toBe('포스터.png')
  })
})
