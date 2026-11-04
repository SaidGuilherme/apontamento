import type { ImportItem } from '../api'
import { dateFromIso, formatDate, formatHours, formatWeekday, plural } from '../format'

const TARGET_HOURS = 8

interface Day {
  date: string
  hours: number
  count: number
  missing: number
}

/** Agrupa as linhas pelo dia do lançamento (data do título ou, sem ela, a Closed Date). */
function groupByDay(items: ImportItem[]): { days: Day[]; undated: number } {
  const map = new Map<string, Day>()
  let undated = 0
  for (const item of items) {
    const date = item.spentOn ?? item.closedDate?.slice(0, 10) ?? null
    if (!date) {
      undated++
      continue
    }
    const day = map.get(date) ?? { date, hours: 0, count: 0, missing: 0 }
    day.hours += item.completedWork ?? 0
    day.count++
    if (!item.completedWork || item.completedWork <= 0) day.missing++
    map.set(date, day)
  }
  return { days: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)), undated }
}

/** Régua com as horas de cada dia, contra a referência de 8 horas. */
export function DayStrip({ items }: { items: ImportItem[] }) {
  const { days, undated } = groupByDay(items)
  if (days.length === 0) return null

  const total = items.reduce((sum, i) => sum + (i.completedWork ?? 0), 0)
  const scale = Math.max(TARGET_HOURS, ...days.map((d) => d.hours)) * 1.05
  const targetBottom = (TARGET_HOURS / scale) * 100
  const below = days.filter((d) => d.hours < TARGET_HOURS).length
  const above = days.filter((d) => d.hours > TARGET_HOURS + 0.001).length

  return (
    <section className="panel panel-body days" aria-label="Horas por dia">
      <div className="section-head">
        <div className="stats">
          <div className="stat">
            <strong>{formatHours(total)} h</strong>
            <span>total</span>
          </div>
          <div className="stat">
            <strong>{days.length}</strong>
            <span>{days.length === 1 ? 'dia' : 'dias'}</span>
          </div>
          <div className="stat">
            <strong>{below}</strong>
            <span>abaixo de 8 h</span>
          </div>
          <div className="stat">
            <strong>{above}</strong>
            <span>acima de 8 h</span>
          </div>
        </div>
        <span className="small muted">
          A linha tracejada marca 8 h.{undated > 0 && ` ${plural(undated, 'linha sem data ficou', 'linhas sem data ficaram')} de fora.`}
        </span>
      </div>
      <div className="days-scroll">
        <div className="days-track">
          {days.map((d) => {
            const weekday = dateFromIso(d.date).getDay()
            const classes = [
              'day',
              d.hours > TARGET_HOURS + 0.001 ? 'over' : '',
              d.missing > 0 ? 'has-missing' : '',
              weekday === 0 || weekday === 6 ? 'weekend' : '',
            ].join(' ')
            const tip = `${formatDate(d.date)}: ${formatHours(d.hours)} h em ${plural(d.count, 'tarefa', 'tarefas')}${
              d.missing > 0 ? `, ${plural(d.missing, 'sem horas', 'sem horas')}` : ''
            }`
            return (
              <div key={d.date} className={classes} title={tip}>
                <span className="day-hours num">{formatHours(d.hours)}</span>
                <div className="day-bar-area">
                  <div className="day-target" style={{ bottom: `${targetBottom}%` }} />
                  <div className="day-bar" style={{ height: `${(d.hours / scale) * 100}%` }} />
                </div>
                <span className="day-label">
                  {formatWeekday(d.date)}
                  <br />
                  <span className="num">{formatDate(d.date).slice(0, 5)}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
