'use client'
import { cn } from '@/lib/utils'

export function LoadingOverlay({ msg = 'กำลังโหลดข้อมูล...' }: { msg?: string }) {
  return (
    <div className="fixed inset-0 bg-gray-50/94 backdrop-blur-sm z-[9998] flex flex-col items-center justify-center gap-5">
      <div className="w-12 h-12 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-sm text-gray-500 font-medium">{msg}</p>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin', className)} />
  )
}
