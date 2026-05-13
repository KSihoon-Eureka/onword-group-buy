/**
 * switchStoreAction 멤버십 가드 테스트.
 *
 * 핵심 동작:
 *  - 미인증 → throw
 *  - 멤버 아닌 store → throw
 *  - 멤버 → 쿠키 set + revalidatePath
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { cookieSetMock, revalidatePathMock, getUserMock, maybeSingleMock } = vi.hoisted(() => ({
  cookieSetMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({ set: cookieSetMock }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('../../supabase/server', () => ({
  getServerSupabase: () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: maybeSingleMock,
          })),
        })),
      })),
    })),
  }),
}))

import { switchStoreAction } from '../switch-store'

describe('switchStoreAction', () => {
  beforeEach(() => {
    cookieSetMock.mockReset()
    revalidatePathMock.mockReset()
    getUserMock.mockReset()
    maybeSingleMock.mockReset()
  })

  it('빈 storeId → throw', async () => {
    await expect(switchStoreAction('')).rejects.toThrow(/storeId required/)
  })

  it('미인증 → throw', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    await expect(switchStoreAction('store-a')).rejects.toThrow(/unauthenticated/)
  })

  it('멤버 아닌 store → throw (cross-store 차단)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null,
    })
    maybeSingleMock.mockResolvedValue({ data: null, error: null })

    await expect(switchStoreAction('foreign-store')).rejects.toThrow(/not a member/)
    expect(cookieSetMock).not.toHaveBeenCalled()
  })

  it('멤버 store → 쿠키 set + revalidate', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null,
    })
    maybeSingleMock.mockResolvedValue({
      data: { store_id: 'store-a' },
      error: null,
    })

    await switchStoreAction('store-a')

    expect(cookieSetMock).toHaveBeenCalledWith(
      'active_store_id',
      'store-a',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout')
  })
})
