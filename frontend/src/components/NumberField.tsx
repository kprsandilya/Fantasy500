import { useEffect, useId, useRef, useState } from 'react'
import { stripLeadingZerosInt } from '../numberInput'

const shell =
  'group relative flex w-full items-center rounded-xl border border-slate-700/50 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all duration-200 ' +
  'focus-within:border-emerald-500/45 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.14)] hover:border-slate-600/60'

const inputBase =
  'min-w-0 flex-1 bg-transparent border-0 py-2.5 pl-3 text-sm tabular-nums tracking-tight text-white placeholder:text-slate-600 focus:ring-0 focus:outline-none disabled:opacity-50'

/** Integer entry: no leading-zero glitches; uses numeric keypad on mobile. */
export function NumberFieldInt({
  label,
  value,
  onChange,
  min,
  max,
  emptyFallback,
  className = '',
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  /** Restored when the field is cleared on blur */
  emptyFallback: number
  className?: string
}) {
  const id = useId()
  const [text, setText] = useState(() => String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])

  function clamp(n: number) {
    return Math.min(max, Math.max(min, n))
  }

  function commit(raw: string) {
    if (raw === '') {
      const n = emptyFallback
      setText(String(n))
      onChange(n)
      return
    }
    const n = parseInt(stripLeadingZerosInt(raw), 10)
    const final = Number.isNaN(n) ? emptyFallback : clamp(n)
    setText(String(final))
    onChange(final)
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-400">
        {label}
      </label>
      <div className={shell}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className={`${inputBase} rounded-xl pr-3`}
          value={text}
          onFocus={() => {
            focused.current = true
          }}
          onBlur={() => {
            focused.current = false
            commit(text)
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            setText(digits)
            if (digits === '') return
            const n = parseInt(stripLeadingZerosInt(digits), 10)
            if (!Number.isNaN(n)) onChange(clamp(n))
          }}
        />
      </div>
    </div>
  )
}

function sanitizeDecimal(raw: string): string {
  let s = raw.replace(/[^\d.]/g, '')
  if (s.startsWith('.')) s = `0${s}`
  const first = s.indexOf('.')
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '')
  }
  const parts = s.split('.')
  let intPart = parts[0] ?? ''
  if (intPart.length > 1) intPart = intPart.replace(/^0+(?=\d)/, '')
  if (parts.length > 1) {
    const frac = (parts[1] ?? '').slice(0, 8)
    return intPart + '.' + frac
  }
  return intPart
}

/** Optional SOL amount: empty = free; supports decimals naturally. */
export function NumberFieldSol({
  label,
  value,
  onChange,
  placeholder = 'Optional',
  className = '',
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
  className?: string
}) {
  const id = useId()
  const [text, setText] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-400">
        {label}
      </label>
      <div className={shell}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          className={`${inputBase} rounded-l-xl pl-3`}
          value={text}
          onFocus={() => {
            focused.current = true
          }}
          onBlur={() => {
            focused.current = false
            const t = text.trim()
            if (t === '' || t === '.') {
              setText('')
              onChange('')
              return
            }
            const n = parseFloat(t)
            if (Number.isNaN(n) || n < 0) {
              setText('')
              onChange('')
              return
            }
            const normalized = String(n)
            setText(normalized)
            onChange(normalized)
          }}
          onChange={(e) => {
            const next = sanitizeDecimal(e.target.value)
            setText(next)
            onChange(next)
          }}
        />
        <span className="shrink-0 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          sol
        </span>
      </div>
    </div>
  )
}
