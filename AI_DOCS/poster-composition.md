# Poster Composition Strategy

> Step 4. 기존 상품 이미지 + 텍스트 오버레이로 그룹채팅용 포스터 생성.
> *생성 AI 사용 안 함* — 기존 이미지를 *조합*하는 방식.

---

## 목표

관리자가 업로드한 기존 상품 이미지를 받아, 표준 템플릿으로 포스터 생성.

참조: 클라이언트가 제공한 슈미트 베개커버 포스터 형식.

---

## 표준 포스터 구조

```
┌─────────────────────────────────────────┐
│ [상단 배너 - 보라색]                     │
│ 입고 예정일 X.X일(X), 수령 마감일 X.X(X) │
├─────────────────────────────────────────┤
│                                          │
│       [메인 상품 이미지]                 │
│       (관리자 업로드)                    │
│                                          │
├─────────────────────────────────────────┤
│ [상품 카테고리 라벨 - 보라색]            │
│ 냉감 쿨 베개커버 세트(2장)              │
│                                          │
│ 🎁  [큰 가격 표시 - 빨강]               │
│     8,900원                              │
│                                          │
│ [추가 정보 - 보라색 바]                  │
│ 사이즈: 66 x 40cm │ 머리에 땀이 끼지...│
└─────────────────────────────────────────┘
```

---

## 기술 선택

**서버 사이드 Sharp** 사용. 이유:
- Node.js 네이티브
- 이미지 합성 + 텍스트 렌더링 강함
- 한글 폰트 지원 (서버에 폰트 설치 필요)

대안 검토:
- 브라우저 Canvas API → 가능하지만 한글 폰트 처리 까다로움
- `node-canvas` → Sharp보다 무거움
- Puppeteer로 HTML→이미지 → 가능하나 오버킬

---

## 구현 흐름

```typescript
// packages/agent/tools/compose-poster.ts

import sharp from 'sharp'
import { uploadToSupabase } from '@/db/storage'

export async function composePoster(input: {
  productId: string
  productName: string
  price: number
  pickupDate: string
  pickupDeadline: string
  category: string         // "냉감 쿨 베개커버 세트(2장)"
  spec: string             // "사이즈: 66 x 40cm | 머리에 땀이 끼지..."
  baseImageBuffer: Buffer  // 관리자가 업로드한 상품 이미지
}) {
  // 1. 기본 이미지 리사이즈 + 중앙 정렬
  const baseImage = await sharp(input.baseImageBuffer)
    .resize(800, 600, { fit: 'cover' })
    .toBuffer()
  
  // 2. 상단 배너 (날짜 정보)
  const topBanner = await renderBanner({
    text: `입고예정일 ${input.pickupDate}, 수령 마감일 ${input.pickupDeadline} 까지`,
    width: 800,
    height: 50,
    bgColor: '#5B2E91',  // 보라색
    textColor: '#FFFFFF'
  })
  
  // 3. 하단 정보 영역 (카테고리 + 가격)
  const bottomSection = await renderBottomSection({
    category: input.category,
    price: input.price,
    spec: input.spec,
    width: 800,
    height: 300
  })
  
  // 4. 세 영역 합성
  const finalImage = await sharp({
    create: {
      width: 800,
      height: 950,  // 50 + 600 + 300
      channels: 4,
      background: '#FFFFFF'
    }
  })
    .composite([
      { input: topBanner, top: 0, left: 0 },
      { input: baseImage, top: 50, left: 0 },
      { input: bottomSection, top: 650, left: 0 }
    ])
    .png()
    .toBuffer()
  
  // 5. Supabase Storage 업로드
  const url = await uploadToSupabase(
    `posters/${input.productId}-${Date.now()}.png`,
    finalImage
  )
  
  return { posterUrl: url }
}
```

---

## 한글 폰트 처리

Sharp는 SVG를 통해 텍스트를 렌더링. 한글 폰트 필요.

```typescript
async function renderBanner({ text, width, height, bgColor, textColor }) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Pretendard, 'Noto Sans KR', sans-serif"
        font-size="20"
        font-weight="bold"
        fill="${textColor}"
        text-anchor="middle"
        dominant-baseline="middle"
      >${text}</text>
    </svg>
  `
  return sharp(Buffer.from(svg)).png().toBuffer()
}
```

**필수 셋업:**
- Pretendard 또는 Noto Sans KR 폰트를 서버에 설치
- Vercel 배포 시 폰트 파일을 `public/fonts/`에 포함
- Dockerfile에 `fc-cache` 실행

---

## 입력 검증

- `baseImageBuffer` 사이즈: 100KB ~ 10MB
- 지원 포맷: JPEG, PNG, WebP
- 너비: 최소 600px (작으면 흐림 처리됨)
- 가격이 음수면 reject

---

## 테스트 전략

```typescript
// packages/agent/tools/__tests__/compose-poster.test.ts

describe('composePoster', () => {
  it('produces 800x950 PNG', async () => {
    const result = await composePoster({
      productId: 'test',
      productName: '슈미트 냉감 베개커버',
      price: 8900,
      // ...
      baseImageBuffer: await fs.readFile('fixtures/pillow.jpg')
    })
    
    const meta = await sharp(result.buffer).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(950)
    expect(meta.format).toBe('png')
  })
  
  it('rejects oversized images', async () => {
    const huge = Buffer.alloc(15 * 1024 * 1024)
    await expect(composePoster({ baseImageBuffer: huge, ... }))
      .rejects.toThrow('Image too large')
  })
})
```

**Fixture:** `packages/agent/__fixtures__/pillow.jpg` (테스트용 더미 이미지)

---

## V2 개선 (다음 스프린트)

- 카테고리별 색상 테마 자동 선택
- 가격 강조 위치 동적 조정
- 다중 상품 콜라주 (3개 등록 시)
- 동영상 포스터 (mp4)
