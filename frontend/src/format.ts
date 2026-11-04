const hoursFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })

export const formatHours = (h: number | null | undefined) => (h == null ? '' : hoursFormat.format(h))

/** Converte "2,5" ou "2.5" em número. Vazio vira null; texto inválido vira NaN. */
export function parseHours(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const normalized = t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

/** "2026-08-03" sem fuso: monta a data local para não voltar um dia. */
export function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const formatDate = (iso: string | null | undefined) => (iso ? dateFormat.format(dateFromIso(iso)) : '')

/** Datas UTC vindas do servidor (createdAt, sentAt). */
export const formatInstant = (iso: string | null | undefined) => (iso ? dateTimeFormat.format(new Date(iso)) : '')

export const formatWeekday = (iso: string) => weekdayFormat.format(dateFromIso(iso)).replace('.', '')

/** "2026-09-02T10:27:10" → valor aceito por <input type="datetime-local" step="1">. */
export const toDateTimeInput = (iso: string | null) => (iso ? iso.slice(0, 19) : '')

export const fromDateTimeInput = (value: string): string | null => {
  if (!value) return null
  return value.length === 16 ? `${value}:00` : value
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
