/**
 * decideAuth — middleware의 redirect 결정 로직 (4 분기).
 * PRD §5.2 로그인 흐름.
 */

import { describe, it, expect } from 'vitest'
import { decideAuth } from '../decide-auth'

describe('decideAuth', () => {
  describe('미인증', () => {
    it('보호 경로 접근 시 /login redirect', () => {
      const result = decideAuth({
        userId: null,
        storeIds: [],
        activeStoreId: null,
        path: '/',
      })
      expect(result).toEqual({ type: 'redirect', to: '/login' })
    })

    it('/login 접근 시 통과', () => {
      const result = decideAuth({
        userId: null,
        storeIds: [],
        activeStoreId: null,
        path: '/login',
      })
      expect(result).toEqual({ type: 'continue' })
    })
  })

  describe('인증 + 0 stores', () => {
    it('보호 경로 접근 시 /no-store redirect', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: [],
        activeStoreId: null,
        path: '/',
      })
      expect(result).toEqual({ type: 'redirect', to: '/no-store' })
    })

    it('/no-store에서는 통과', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: [],
        activeStoreId: null,
        path: '/no-store',
      })
      expect(result).toEqual({ type: 'continue' })
    })

    it('이미 인증된 사용자가 /login 접근 시 / redirect', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: [],
        activeStoreId: null,
        path: '/login',
      })
      expect(result).toEqual({ type: 'redirect', to: '/' })
    })
  })

  describe('인증 + 1 store', () => {
    it('쿠키 없으면 자동 set + 통과', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: ['store-a'],
        activeStoreId: null,
        path: '/',
      })
      expect(result).toEqual({ type: 'continue', setActiveStoreId: 'store-a' })
    })

    it('쿠키 일치하면 통과만', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: ['store-a'],
        activeStoreId: 'store-a',
        path: '/',
      })
      expect(result).toEqual({ type: 'continue' })
    })

    it('/select-store 접근 시 / redirect (멤버 1개는 선택 불필요)', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: ['store-a'],
        activeStoreId: 'store-a',
        path: '/select-store',
      })
      expect(result).toEqual({ type: 'redirect', to: '/' })
    })
  })

  describe('인증 + 2+ stores', () => {
    it('쿠키 없으면 /select-store redirect', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: ['store-a', 'store-b'],
        activeStoreId: null,
        path: '/',
      })
      expect(result).toEqual({
        type: 'redirect',
        to: '/select-store',
        clearActiveStore: false,
      })
    })

    it('쿠키가 멤버 store와 무관하면 /select-store + clear', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: ['store-a', 'store-b'],
        activeStoreId: 'store-X-unrelated',
        path: '/',
      })
      expect(result).toEqual({
        type: 'redirect',
        to: '/select-store',
        clearActiveStore: true,
      })
    })

    it('쿠키 유효하면 통과', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: ['store-a', 'store-b'],
        activeStoreId: 'store-b',
        path: '/',
      })
      expect(result).toEqual({ type: 'continue' })
    })

    it('쿠키 무효 상태로 /select-store 접근은 통과 (선택 화면)', () => {
      const result = decideAuth({
        userId: 'u1',
        storeIds: ['store-a', 'store-b'],
        activeStoreId: null,
        path: '/select-store',
      })
      expect(result).toEqual({ type: 'continue' })
    })
  })
})
