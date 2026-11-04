import { useEffect, useState } from 'react'
import { formatHours, parseHours } from '../format'

interface Props {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  label: string
  className?: string
}

/** Campo de horas que aceita vírgula ou ponto. Só confirma o valor ao sair do campo. */
export function HoursInput({ value, onChange, disabled, label, className = 'cell' }: Props) {
  const [text, setText] = useState(formatHours(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setText(formatHours(value))
    setInvalid(false)
  }, [value])

  const commit = () => {
    const parsed = parseHours(text)
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (parsed !== value) onChange(parsed)
    setText(formatHours(parsed))
  }

  return (
    <input
      className={`${className} num right${invalid ? ' invalid' : ''}`}
      style={{ textAlign: 'right' }}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={invalid ? 'Use um número, por exemplo 2,5' : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
