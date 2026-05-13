'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { signInAction, type SignInResult } from '@/lib/actions/sign-in'

const initialState: SignInResult = { error: '' }

export function LoginForm() {
  const [state, formAction] = useFormState(signInAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-[12px] font-medium text-zinc-700 mb-1.5">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full px-4 py-3 rounded-xl border border-black/[0.04] bg-white text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-black/20"
          placeholder="example@onword.kr"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[12px] font-medium text-zinc-700 mb-1.5">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="w-full px-4 py-3 rounded-xl border border-black/[0.04] bg-white text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-black/20"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full px-4 py-3 rounded-full bg-black text-white text-[14px] font-medium shadow-sm hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? '로그인 중...' : '로그인'}
    </button>
  )
}
