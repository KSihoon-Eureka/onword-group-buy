import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind 클래스 조건부 결합 + 중복 제거.
 * 모든 컴포넌트에서 className 결합 시 사용.
 * 
 * 출처: Versatile Execution Agent (src/lib/utils.ts)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
