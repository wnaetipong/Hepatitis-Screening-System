'use client'

import { useEffect, useState, createContext, useContext, useCallback, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ToastData { id: number; msg: string; type: 'ok' | 'err' }

interface ToastCtx { showToast: (msg: string, type?: 'ok' | 'err') => void }
const Ctx = createContext<ToastCtx>({ showToast: () => {} })

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++counter
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }, [])

  return (
    <Ctx.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-7 right-7 z-[9999] flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-3 px-5 py-3.5 rounded-xl border text-sm shadow-xl',
              'animate-fade-up',
              t.type === 'ok'  && 'bg-emerald-50 border-emerald-200 text-emerald-800',
              t.type === 'err' && 'bg-red-50 border-red-200 text-red-800',
            )}
          >
            <span className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',
              t.type === 'ok' ? 'bg-emerald-500' : 'bg-red-500',
            )}>
              {t.type === 'ok' ? '✓' : '✕'}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() { return useContext(Ctx) }
