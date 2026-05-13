/**
 * /login — 이메일 + 비밀번호 폼 (PLAN.md B.1, PRD §5.2).
 *
 * Server Component shell + Client Component form.
 * 미들웨어가 이미 인증된 사용자를 / 로 redirect하므로 여기서는 추가 체크 불필요.
 */

import { LoginForm } from './login-form'

export const metadata = {
  title: '로그인 — 공구 관리 대시보드',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F3F3] px-4">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold text-black tracking-tight">
            공구 관리 대시보드
          </h1>
          <p className="mt-2 text-[13px] text-zinc-500">사장님 로그인</p>
        </div>

        <div className="bg-white rounded-[32px] border border-black/[0.04] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-8">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-[12px] text-zinc-400">
          비밀번호가 기억나지 않으면 운영자에게 문의해주세요.
        </p>
      </div>
    </div>
  )
}
