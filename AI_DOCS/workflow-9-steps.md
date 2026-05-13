# 9-Step Group Buy Workflow

> 클라이언트가 그린 캔버스를 텍스트화. 모든 Agent tool은 이 문서를 기준으로 동작.
> 마지막 업데이트: 2025-05-13 (캔버스 v2)

---

## 전체 흐름

```
1. 상품 발주 입력 (수동, 유일한 human input)
        ↓
2. 오픈채팅 공고① 생성 (AI 자동)
        ↓
3. 상품 정보 웹 크롤링 + 그룹채팅 공지 (AI 자동, 네이버 가격비교)
        ↓
4. 상품 포스트 제작 + 그룹채팅 공지 (AI 자동)
        ↓
5. 고객 주문 수집 + DB 연결 (자동)
        ↓
6. 수령날짜 비교 테이블 제작 + 오픈채팅 (AI 자동)
        ↓
7. 상품 재고 및 주문 조회 + 누락 검수 (대시보드)
        ↓
8. 도매업자에게 주문 내용 전달 (AI 자동, 이메일)
        ↓
9. 오픈채팅 공고③ — 수령 안내 (AI 자동)
```

---

## Step 1: 상품 발주 정보 기입 (수동 입력)

**누가:** 매장 관리자 (대시보드)
**입력 필드:**
- 기본 정보 (상품명, 설명)
- 수량 (재고)
- 마감 날짜 (주문 마감)
- 입고 날짜
- 픽업 수령 날짜

**DB:** `products` 테이블에 insert
**트리거:** insert 완료 시 Step 2 자동 시작

---

## Step 2: 오픈채팅 공고① 자동 생성

**Tool:** `generate_announcement(productId, stage=1)`
**입력:**
- 상품 이름
- 상품 정보 및 설명
- 가격 (비교 가격 포함)
- 소비기한, 예약마감일, 입고예정일, 수령마감일
- 예약방법 안내

**출력:** 카카오톡 오픈채팅용 텍스트 (이모지 포함)
**형식:** `AI_DOCS/kakao-text-format.md` §1 참조
**전송 방식:** 텍스트 생성만, **대시보드에 복사 버튼 표시** (카카오 API 없음)

**DB:** `generated_assets` 테이블에 type='announcement', stage='order_open' 저장

---

## Step 3: 상품 정보 웹 크롤링 + 공지

**Tool:** `crawl_naver_price(productName)` + `generate_announcement` (가격비교 포함)
**입력:**
- 상품명 (네이버 검색용)

**자동 수행:**
1. 네이버 쇼핑에서 동일/유사 상품 최저가 검색
2. 가격비교 데이터 추출 (시중가, 모델명, 판매처)
3. 네이버 최저가 캡처본 생성 (스크린샷 이미지)
4. 그룹채팅용 공지 텍스트에 가격비교 정보 포함

**출력:**
- 가격비교 데이터 (JSON)
- 캡처 이미지 (Supabase Storage 저장)
- 공지 텍스트

**DB:** `generated_assets` 에 type='price_compare', asset_url 포함

**도전 과제:** 네이버 봇 차단 위험
**대응:** `AI_DOCS/naver-crawl-strategy.md` §rate-limiting 참조

---

## Step 4: 상품 포스트 제작 + 공지

**Tool:** `compose_poster(productId, sourceImages, textOverlay)`
**입력:**
- 기존 상품 이미지 (관리자가 업로드)
- 텍스트 정보 (상품명, 가격, 마감일 등)

**자동 수행:**
1. 기존 이미지 위에 텍스트 오버레이 합성
2. 표준 포스터 템플릿 적용 (예시: 슈미트 베개커버 포스터)
3. 그룹채팅용 공지 텍스트 + 포스터 이미지 생성

**출력:** 포스터 이미지 (Supabase Storage)
**참조:** `AI_DOCS/poster-composition.md`

**중요:** 생성 AI(DALL-E)는 사용하지 않음. *기존 이미지 + 텍스트 합성*만.

---

## Step 5: 고객 주문 수집 + DB 연결

**프론트:** `apps/order-web` (Next.js)
**입력:** 고객 이름, 연락처, 수량
**자동 수행:**
- `orders` 테이블에 insert
- 실시간으로 대시보드에 반영 (Supabase Realtime)
- 남은 수량 자동 갱신

**Agent tool 없음** (UI 자동화만)

---

## Step 6: 수령날짜 비교 테이블 제작 + 공지

**Tool:** `generate_pickup_table(activeProducts)`
**입력:** 현재 진행 중인 모든 상품 목록 + 각각의 수령 가능 기간

**자동 수행:**
1. 캔버스의 "언제 찾으러 갈까요?" 테이블 형식으로 시각화
2. 컬럼: 상품명, 진행 상태(마감 임박/수령 가능/상품 준비), 날짜별 가능 여부, 수령 마감일
3. 색상 코딩: 마감 임박(빨강), 수령 가능(초록), 상품 준비(파랑)
4. 테이블을 이미지로 변환 (스크린샷)
5. 오픈채팅용 텍스트 + 이미지 생성

**출력:** 테이블 이미지 + 안내 텍스트
**참조:** `AI_DOCS/pickup-table-design.md`

---

## Step 7: 상품 재고 및 주문 조회 + 누락 검수

**대시보드 자동화**
- 주문 내역 조회 (orders 테이블)
- 누락 검수: 결제는 됐는데 데이터 없는 주문, 또는 그 반대
- 이상 주문 자동 표시 (anomaly_detected 필드)

**Agent tool:** `get_orders(productId, includeAnomalies=true)`
**용도:** 다른 tool이 이 데이터를 활용 (Step 8 등)

---

## Step 8: 도매업자에게 주문 내용 전달

**Tool:** `notify_wholesaler(productId, method='email')`
**입력:**
- 상품 ID
- 전송 방법 (이메일 / SMS)

**자동 수행:**
1. `get_orders` 호출해 주문 내역 집계
2. 도매업자용 이메일 본문 생성:
   - 상품명, 총 수량
   - 입고 희망일
   - 매장 정보 (받는 곳)
3. Resend API로 이메일 전송 (또는 SMS)
4. 전송 결과 `trace_steps`에 기록

**DB:** 전송 완료 후 `products.flow_stage = 'warehouse_notified'`

---

## Step 9: 오픈채팅 공고③ — 수령 안내

**Tool:** `generate_announcement(productId, stage=3)`
**입력:** 입고 완료된 상품 목록

**자동 수행:**
1. 오늘 수령 가능한 상품 목록 생성
2. 카카오톡 안내 텍스트 생성
3. 대시보드에 복사 버튼 표시

**형식:** `AI_DOCS/kakao-text-format.md` §3 참조

---

## Tool 매핑 요약

| Step | Tool 이름 | 우선순위 |
|---|---|---|
| 2 | `generate_announcement(stage=1)` | **P0** |
| 3 | `crawl_naver_price` | **P0** |
| 3 | `generate_announcement(가격비교 포함)` | P0 |
| 4 | `compose_poster` | **P0** |
| 6 | `generate_pickup_table` | P1 |
| 7 | `get_orders` | **P0** |
| 8 | `notify_wholesaler` | **P0** |
| 9 | `generate_announcement(stage=3)` | **P0** |

**P0** = Day 1-2 안에 작동 필수
**P1** = 시간 남으면

---

## Action Triggers (오케스트레이터가 자동 실행하는 단위)

| Action | 호출되는 Tool 순서 |
|---|---|
| `start_campaign` | `generate_announcement(1)` → `crawl_naver_price` → `compose_poster` |
| `close_orders` | `get_orders(anomalies=true)` → `generate_pickup_table` |
| `notify_warehouse` | `get_orders` → `notify_wholesaler` |
| `announce_pickup` | `generate_announcement(3)` |

이 action들이 *대시보드의 버튼*으로 노출됨. 또는 Agent Chat에서 자연어로 호출.
