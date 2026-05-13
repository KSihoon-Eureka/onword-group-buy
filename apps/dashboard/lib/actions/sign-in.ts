'use server'

/**
 * signInAction — 이메일 + 비밀번호 로그인 (PLAN.md B.1).
 *
 * 실패 시 한국어 에러 string 반환. 성공 시 / redirect.
 * Sprint 1 브루트포스 방어 없음 — Phase F.5에서 Turnstile 추가.
 */

import { redirect } from 'next/navigation'
import { getServerSupabase } from '../supabase/server'

export interface SignInResult {
  error: string
}

export async function signInAction(
  _prevState: SignInResult | null,
  formData: FormData,
): Promise<SignInResult> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return { error: '이메일과 비밀번호를 입력해주세요.' }
  }

  const supabase = getServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  }

  redirect('/')
}
