// packages/agent/tools.ts
// Claude API의 tool_use에 전달할 tool 정의들.
// 각 tool의 실제 구현은 packages/agent/tools/*.ts에 있음.

import type Anthropic from '@anthropic-ai/sdk'

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_announcement',
    description: `오픈채팅(카카오톡) 공고 텍스트를 생성한다.
stage=1: 모집 시작 공고 (상품 소개 + 가격 + 마감일)
stage=3: 수령 안내 공고 (오늘 수령 가능한 상품 목록)
포맷은 AI_DOCS/kakao-text-format.md 표준을 정확히 따른다.`,
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '상품 ID. DB에서 상품 정보를 조회한다.'
        },
        stage: {
          type: 'number',
          enum: [1, 2, 3],
          description: '공고 단계. 1=모집, 2=마감임박, 3=수령안내'
        }
      },
      required: ['productId', 'stage']
    }
  },
  
  {
    name: 'crawl_naver_price',
    description: `네이버 쇼핑에서 상품의 최저가와 가격비교 정보를 크롤링한다.
스크린샷 이미지도 함께 저장한다.
실패 시 빈 결과 반환 (절대 추측하지 않는다).`,
    input_schema: {
      type: 'object',
      properties: {
        productName: {
          type: 'string',
          description: '검색할 상품명. 너무 짧으면 결과가 부정확하므로 브랜드+제품명 권장.'
        }
      },
      required: ['productName']
    }
  },
  
  {
    name: 'compose_poster',
    description: `기존 상품 이미지에 텍스트를 합성해 그룹채팅용 포스터를 생성한다.
생성 AI를 사용하지 않고 Sharp 라이브러리로 합성한다.
출력: 800x950 PNG, Supabase Storage URL.`,
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '상품 ID. DB에서 가격/마감일/소재정보 조회.'
        },
        baseImageUrl: {
          type: 'string',
          description: '기존 상품 이미지 URL (관리자가 업로드한 것).'
        }
      },
      required: ['productId', 'baseImageUrl']
    }
  },
  
  {
    name: 'generate_pickup_table',
    description: `진행 중인 상품들의 수령 가능 기간을 시각화한 테이블 이미지를 생성한다.
캔버스의 "언제 찾으러 갈까요?" 형식.
색상 코딩: 마감임박=빨강, 수령가능=초록, 상품준비=파랑.`,
    input_schema: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'string' },
          description: '포함할 상품 ID 목록. 생략 시 active 상품 전체.'
        }
      }
    }
  },
  
  {
    name: 'get_orders',
    description: `특정 상품의 주문 내역을 조회한다.
includeAnomalies=true이면 누락/이상 주문도 함께 반환.
다른 tool들이 데이터 가져올 때 사용.`,
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '상품 ID.'
        },
        includeAnomalies: {
          type: 'boolean',
          description: '이상 주문 포함 여부. 기본값 false.'
        }
      },
      required: ['productId']
    }
  },
  
  {
    name: 'notify_wholesaler',
    description: `도매업자에게 주문 내역을 이메일로 자동 전송한다.
get_orders로 주문 집계 후 발송.
성공 시 products.flow_stage를 'warehouse_notified'로 업데이트.`,
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '상품 ID.'
        },
        method: {
          type: 'string',
          enum: ['email', 'sms'],
          description: '전송 방법. 기본값 email.'
        }
      },
      required: ['productId']
    }
  }
] as const

// Tool 이름 → 실제 함수 매핑 (orchestrator.ts에서 사용)
export type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>

// 각 tool의 실제 구현은 별도 파일. 여기서 export.
export { generateAnnouncement } from './tools/generate-announcement'
export { crawlNaverPrice } from './tools/crawl-naver-price'
export { composePoster } from './tools/compose-poster'
export { generatePickupTable } from './tools/generate-pickup-table'
export { getOrders } from './tools/get-orders'
export { notifyWholesaler } from './tools/notify-wholesaler'
