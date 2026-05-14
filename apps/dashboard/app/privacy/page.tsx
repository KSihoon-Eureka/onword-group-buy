/**
 * /privacy — 개인정보처리방침 (PIPA Article 30).
 *
 * 공개 페이지 (미인증/멤버없음도 접근). middleware PUBLIC_PATHS 에 등록.
 * 내용 기준: PRD §6 PIPA 명세.
 *
 * 변경 시 주의: PIPA Article 30.2 — 정책 변경 시 사용자에게 사전 고지 의무.
 * 운영 환경에서는 변경 이력 + 시행일 표시 필수 (Phase G+).
 */

import Link from 'next/link'

export const metadata = {
  title: '개인정보처리방침 — 판다팜',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#F3F3F3] text-zinc-900 font-sans">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <header className="mb-10">
          <Link
            href="/login"
            className="text-[12px] text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            ← 로그인으로
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            개인정보처리방침
          </h1>
          <p className="mt-2 text-[13px] text-zinc-500">
            시행일: 2026년 5월 14일
          </p>
        </header>

        <article className="prose prose-zinc max-w-none">
          <Section title="제1조 (총칙)">
            <p>
              본 처리방침은 판다팜 (이하 &quot;서비스&quot;) 이 「개인정보 보호법」
              (PIPA) 에 따라 이용자의 개인정보를 어떻게 수집·이용·보관·파기하는지
              안내합니다.
            </p>
          </Section>

          <Section title="제2조 (수집하는 개인정보 항목)">
            <p>서비스는 다음 항목만 수집합니다:</p>
            <ul>
              <li>
                <strong>고객 휴대전화 번호 끝 4자리</strong> (예: <code>1234</code>) —
                상품 픽업 안내 및 주문 식별 목적
              </li>
              <li>
                <strong>고객 이름</strong> (선택) — 매장 내 주문 식별 목적
              </li>
              <li>
                <strong>주문 정보</strong> (수량, 상품, 주문 일시) — 주문 처리 목적
              </li>
              <li>
                <strong>동의 시각</strong> — 「개인정보 보호법」 제15조 동의 기록
              </li>
            </ul>
            <p>
              <strong>수집하지 않는 정보:</strong> 휴대전화 번호 전체, 주민등록번호,
              주소, 이메일, 결제 정보, 위치 정보.
            </p>
          </Section>

          <Section title="제3조 (수집 목적)">
            <ul>
              <li>공동구매 상품의 픽업 안내 (카카오톡 오픈채팅)</li>
              <li>매장 내 주문 식별 및 인계</li>
              <li>도매업자에게 총 주문 수량 전달 (개별 고객 정보 미포함)</li>
              <li>주문 통계 및 매장 운영 분석 (개인 식별 불가능한 집계)</li>
            </ul>
          </Section>

          <Section title="제4조 (보유 및 이용 기간)">
            <p>
              「개인정보 보호법」 제21조에 따라 수집 목적이 달성되면 즉시 파기합니다.
              구체적 보유 기간:
            </p>
            <ul>
              <li>
                <strong>픽업 완료 후 1년</strong>: 픽업 완료 시점부터 1년 경과 후
                휴대전화 번호 끝 4자리 자동 삭제 (NULL 처리)
              </li>
              <li>
                <strong>취소 / 미수령 후 30일</strong>: 주문 취소 또는 미수령
                (no_show) 상태로 변경된 후 30일 경과 시 자동 삭제
              </li>
              <li>
                <strong>고객 삭제 요청 시</strong>: 매장에 요청 시 즉시 NULL 처리
              </li>
            </ul>
            <p>
              자동 삭제는 매일 자정 (KST) 에 실행되는 시스템 cron 작업으로
              처리됩니다. 삭제 이력은 접근 로그에 기록됩니다.
            </p>
          </Section>

          <Section title="제5조 (제3자 제공)">
            <p>
              <strong>도매업자에게 고객 휴대전화 번호를 제공하지 않습니다.</strong>
              「개인정보 보호법」 제17조에 따라 본인 동의 없는 제3자 제공을 금지합니다.
            </p>
            <p>도매업자에게 전달되는 정보:</p>
            <ul>
              <li>상품명 및 총 주문 수량 (예: &quot;A상품 200개&quot;)</li>
              <li>매장명 및 입고 희망일</li>
            </ul>
            <p>전달되지 않는 정보:</p>
            <ul>
              <li>고객 이름</li>
              <li>고객 휴대전화 번호 (끝 4자리 포함 일체)</li>
              <li>개별 주문 분리 내역</li>
            </ul>
          </Section>

          <Section title="제6조 (접근 권한 및 로그)">
            <p>
              「개인정보 보호법」 제29조에 따라 휴대전화 번호 끝 4자리에 접근하는
              모든 행위는 별도 로그 (<code>phone_access_log</code>) 에 기록됩니다.
            </p>
            <ul>
              <li>접근자 (매장 매니저) 식별 정보</li>
              <li>접근 시각</li>
              <li>접근 사유 (view / edit / export / delete)</li>
              <li>대상 주문 식별자</li>
            </ul>
            <p>
              로그는 영구 보존되며, 부정 접근 의심 시 매장 책임자가 조회할 수 있습니다.
            </p>
          </Section>

          <Section title="제7조 (보안 조치)">
            <ul>
              <li>
                <strong>최소 수집 원칙</strong>: 휴대전화 번호 끝 4자리만 저장하여
                단독으로는 본인 식별이 불가능하도록 합니다 (「개인정보 보호법」
                제16조 최소 수집).
              </li>
              <li>
                <strong>저장 보안</strong>: Supabase Postgres 의 기본 백업 암호화를
                적용하며, 서비스 역할 키 (service role key) 는 클라이언트에 절대
                노출하지 않습니다.
              </li>
              <li>
                <strong>RLS</strong>: Row-Level Security 정책으로 매장 멤버만 본인
                매장의 주문에 접근 가능합니다.
              </li>
              <li>
                <strong>전송 보안</strong>: 모든 통신은 HTTPS (TLS 1.2 이상) 로
                암호화됩니다.
              </li>
            </ul>
          </Section>

          <Section title="제8조 (이용자의 권리)">
            <p>
              「개인정보 보호법」 제35조부터 제38조에 따라 이용자는 다음 권리를
              행사할 수 있습니다:
            </p>
            <ul>
              <li>
                <strong>열람권</strong>: 휴대전화 번호 끝 4자리로 본인 주문 조회
                (매장에 문의)
              </li>
              <li>
                <strong>삭제권</strong>: 매장에 삭제 요청 시 즉시 NULL 처리
              </li>
              <li>
                <strong>정정권</strong>: 정보 오류 발견 시 매장에 정정 요청
              </li>
              <li>
                <strong>처리 정지권</strong>: NULL 처리로 사실상 처리 정지
              </li>
            </ul>
            <p>권리 행사는 주문한 매장에 직접 연락하시면 됩니다.</p>
          </Section>

          <Section title="제9조 (쿠키)">
            <p>
              본 서비스는 로그인 세션 유지를 위한 필수 쿠키 외에는 광고/추적 쿠키를
              사용하지 않습니다.
            </p>
            <ul>
              <li>
                <strong>인증 쿠키</strong> (Supabase): 로그인 세션 유지. 브라우저
                종료 시 또는 명시적 로그아웃 시 만료.
              </li>
              <li>
                <strong>활성 매장 쿠키</strong>: 다중 매장 운영자의 현재 선택 매장
                기록. 90일.
              </li>
            </ul>
          </Section>

          <Section title="제10조 (개인정보 보호 책임자)">
            <p>
              개인정보 처리에 관한 문의, 불만 처리, 피해 구제는 본 서비스에
              가입한 매장에 직접 연락하시기 바랍니다.
            </p>
            <p>
              또한 다음 기관에 도움을 요청할 수 있습니다:
            </p>
            <ul>
              <li>
                개인정보 분쟁조정위원회: 1833-6972 /{' '}
                <a
                  href="https://www.kopico.go.kr"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  kopico.go.kr
                </a>
              </li>
              <li>
                개인정보 침해신고센터: 118 /{' '}
                <a
                  href="https://privacy.kisa.or.kr"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  privacy.kisa.or.kr
                </a>
              </li>
              <li>대검찰청 사이버수사과: 1301</li>
              <li>경찰청 사이버안전국: 182</li>
            </ul>
          </Section>

          <Section title="제11조 (정책 변경)">
            <p>
              본 처리방침이 변경되는 경우 「개인정보 보호법」 제30조 제2항에 따라
              시행일 7일 전 본 페이지에서 공지합니다. 중대한 변경의 경우 30일 전
              공지합니다.
            </p>
          </Section>
        </article>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[18px] font-semibold mb-3 text-zinc-900">{title}</h2>
      <div className="text-[14px] leading-relaxed text-zinc-700 space-y-2">
        {children}
      </div>
    </section>
  )
}
