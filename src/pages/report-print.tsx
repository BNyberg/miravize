import { format, parseISO } from 'date-fns'
import { Fragment } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { formatHours } from '@/lib/splits'

import {
  buildLines,
  donutSlicePath,
  formatMoney,
  isFullRing,
  type Bucket,
  type Line,
  type Money,
} from './reports-page'

type PrintReport = {
  totalSeconds: number
  money: Money
  requestCount: number
  taskCount: number
  completedCount: number
  projects: Bucket[]
  clients: Bucket[]
  activities: Bucket[]
  clientSplits: Parameters<typeof buildLines>[0]['clientSplits']
  shares: Parameters<typeof buildLines>[0]['shares']
  requestTime: Parameters<typeof buildLines>[0]['requestTime']
  taskTime: Parameters<typeof buildLines>[0]['taskTime']
  requestItems: Parameters<typeof buildLines>[0]['requestItems']
  taskItems: Parameters<typeof buildLines>[0]['taskItems']
}

export function ReportPrint({
  from,
  to,
  workspaceName,
  report,
  projectColor,
  clientName,
}: {
  from: string
  to: string
  workspaceName: string
  report: PrintReport
  projectColor: (id: string) => string | undefined
  clientName: (id: string) => string
}) {
  const lines = buildLines(report, 'project-client', projectColor, clientName)
  const requestSeconds = report.requestTime.reduce((sum, row) => sum + row.seconds, 0)
  const taskSeconds = report.taskTime.reduce((sum, row) => sum + row.seconds, 0)

  return (
    <section className="report-print">
      <header className="flex items-center justify-between gap-8">
        <h1 className="text-[28px] font-medium leading-none tracking-tight text-[#1c1b19]">{workspaceName}</h1>
        <a data-pdf-link href="https://miravize.com" className="inline-block leading-none">
          <BrandMark onLight className="size-9" />
        </a>
      </header>

      <div className="mt-5 flex items-end justify-between gap-8 border-t border-[#ddd9d2] pt-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#5e5c57] uppercase">Report date</p>
          <p className="mt-1 text-[22px] leading-none tracking-tight text-[#1c1b19]">{formatRange(from, to)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#5e5c57] uppercase">Tracked time</p>
          <p className="mt-1 text-[22px] leading-none tracking-tight text-[#1c1b19] tabular-nums">{formatTracked(report.totalSeconds)}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <PrintDonut title="Hours by project" slices={report.projects} />
        <PrintDonut title="Hours by client" slices={report.clients} />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-[#1c1b19]">Breakdown</h2>
          <p className="text-[11px] text-[#5e5c57]">Project / clients</p>
        </div>
        {lines.length === 0 && report.totalSeconds === 0 && report.requestCount === 0 && report.taskCount === 0 ? (
          <p className="text-sm text-[#5e5c57]">No time, requests, or tasks in this range.</p>
        ) : (
          <div className="overflow-visible rounded border border-[#ddd9d2] bg-[#fbfaf7]">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-[#ddd9d2] text-left text-[10px] font-medium tracking-[0.06em] text-[#5e5c57]">
                  <th className="px-3 py-2 font-medium">Project / clients</th>
                  <th className="w-36 px-3 py-2 font-medium">Total share</th>
                  <th className="px-3 py-2 text-right font-medium">Total hours</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Requests</th>
                  <th className="px-3 py-2 text-right font-medium">Request hours</th>
                  <th className="px-3 py-2 text-right font-medium">Tasks</th>
                  <th className="px-3 py-2 text-right font-medium">Completed</th>
                  <th className="px-3 py-2 text-right font-medium">Task hours</th>
                </tr>
              </thead>
              <tbody>
                <PrintRows lines={lines} totalSeconds={report.totalSeconds} />
              </tbody>
              <tfoot>
                <tr className="border-t border-[#ddd9d2] font-medium text-[#1c1b19]">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2">
                    <ShareBar seconds={report.totalSeconds} total={report.totalSeconds} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(report.totalSeconds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(report.money)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{report.requestCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(requestSeconds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{report.taskCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{report.completedCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(taskSeconds)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <GeneratedBy />
    </section>
  )
}

function GeneratedBy() {
  return (
    <p className="mt-8 text-xs leading-5 text-[#5e5c57]">
      <span className="inline-block align-middle leading-5">Report generated by</span>
      <a data-pdf-link href="https://miravize.com" className="ml-1 inline-block align-middle leading-none">
        <img src="/miravize-wordmark.png" alt="Miravize" height={20} className="inline-block h-5 w-auto align-middle" />
      </a>
    </p>
  )
}

function formatRange(from: string, to: string) {
  const start = parseISO(from)
  const end = parseISO(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from} – ${to}`
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  }
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
}

function formatTracked(totalSeconds: number) {
  const total = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (minutes === 60) return `${hours + 1}h 0m`
  return `${hours}h ${minutes}m`
}

function PrintDonut({ title, slices }: { title: string; slices: Bucket[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.seconds, 0)
  let angle = -Math.PI / 2
  const arcs = slices.map((slice) => {
    const share = total > 0 ? slice.seconds / total : 0
    const start = angle
    angle += share * Math.PI * 2
    return { ...slice, start, end: angle, share }
  })

  return (
    <div className="print-keep rounded border border-[#ddd9d2] bg-[#fbfaf7] p-4">
      <p className="text-sm font-medium text-[#1c1b19]">{title}</p>
      {slices.length === 0 ? (
        <p className="mt-3 text-sm text-[#5e5c57]">No hours.</p>
      ) : (
        <div className="mt-3 flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="size-32 shrink-0" role="img" aria-label={title}>
            {arcs.map((slice) =>
              isFullRing(slice.start, slice.end) ? (
                <circle key={slice.id} cx={50} cy={50} r={37} fill="none" stroke={slice.color} strokeWidth={18} />
              ) : (
                <path key={slice.id} d={donutSlicePath(50, 50, 46, 28, slice.start, slice.end)} fill={slice.color} />
              ),
            )}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1">
            {arcs.map((slice) => (
              <li key={slice.id} className="flex items-center gap-2 text-xs leading-4 text-[#1c1b19]">
                <span className="size-2 shrink-0 rounded-sm" style={{ background: slice.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1">{slice.label}</span>
                <span className="shrink-0 tabular-nums text-[#5e5c57]">
                  {formatHours(slice.seconds)} ({Math.round(slice.share * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ShareBar({ seconds, total, color }: { seconds: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((seconds / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#e8e6e0]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color ?? '#1c1b19' }} />
      </div>
      <span className="tabular-nums text-[#5e5c57]">{pct}%</span>
    </div>
  )
}

function PrintRows({ lines, totalSeconds }: { lines: Line[]; totalSeconds: number }) {
  return lines.map((line) => (
    <Fragment key={line.key}>
      <tr className={line.depth === 0 ? 'border-b border-[#ddd9d2] text-[#1c1b19]' : 'border-b border-[#ddd9d2] text-[#5e5c57]'}>
        <td className="px-3 py-1.5" style={{ paddingLeft: 12 + line.depth * 16 }}>
          <span className={line.depth === 0 ? 'font-medium' : undefined}>{line.label}</span>
        </td>
        <td className="px-3 py-1.5">
          {line.billing ? <ShareBar seconds={line.seconds} total={totalSeconds} color={line.color} /> : '—'}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">{line.billing ? formatHours(line.seconds) : '—'}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{line.billing ? formatMoney(line.money) : '—'}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{line.requests}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{formatHours(line.requestSeconds)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{line.tasks}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{line.completed}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{formatHours(line.taskSeconds)}</td>
      </tr>
      {line.children.length > 0 ? <PrintRows lines={line.children} totalSeconds={totalSeconds} /> : null}
    </Fragment>
  ))
}
