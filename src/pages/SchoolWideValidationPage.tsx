import { useMemo } from 'react'
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'
import { useApp } from '@/App'
import { buildSchoolWideValidation } from '@/engine/validator'

export function SchoolWideValidationPage() {
  const { data } = useApp()
  const latest = data.timetables.at(-1)
  const entries = latest ? data.entries.filter(e => e.timetableId === latest.id) : []
  const report = useMemo(() => buildSchoolWideValidation(entries, data), [entries, data])
  const s = report.summary

  const CheckCard = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {value === 0 ? <CheckCircle2 className="text-emerald-600" size={18} /> : <XCircle className="text-rose-600" size={18} />}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${value === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{value}</div>
    </div>
  )

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">School-wide Validation</h1>
        <p className="mt-1 text-sm text-slate-500">One global validation pass across every active class and every teacher.</p>
      </div>
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${s.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
        <ShieldCheck size={16} /> {s.valid ? 'Valid school-wide timetable' : 'Timetable has blocking issues'}
      </div>
    </div>

    {!latest ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">No generated timetable exists yet. Generate the timetable first; validation always checks the complete school-wide timetable.</div> : <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <CheckCard label="Teacher conflicts" value={s.teacherConflicts} />
        <CheckCard label="Class conflicts" value={s.classConflicts} />
        <CheckCard label="Missing subject periods" value={s.missingSubjectPeriods} />
        <CheckCard label="Extra subject periods" value={s.extraSubjectPeriods} />
        <CheckCard label="Teacher workload violations" value={s.teacherWorkloadViolations} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">School-wide totals</h2><p className="mt-1 text-sm text-slate-500">All active classes are validated together. Class PDFs are only filtered views of this same master timetable.</p></div>
          <div className="text-sm text-slate-600">{s.totalActualPeriods} / {s.totalExpectedPeriods} total periods</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3"><div className="text-sm text-slate-500">Missing periods</div><div className="mt-1 text-lg font-semibold">{s.missingPeriods}</div></div>
          <div className="rounded-lg border p-3"><div className="text-sm text-slate-500">Extra periods</div><div className="mt-1 text-lg font-semibold">{s.extraPeriods}</div></div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Teacher workload</h2><p className="mt-1 text-sm text-slate-500">Assigned periods are counted across the entire school timetable.</p></div></div>
        <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-[820px] w-full text-sm"><thead><tr className="bg-slate-50 text-left"><th className="p-3">Teacher</th><th className="p-3">Assigned Periods</th><th className="p-3">Minimum</th><th className="p-3">Target</th><th className="p-3">Maximum</th><th className="p-3">Free Periods</th><th className="p-3">Status</th></tr></thead>
            <tbody>{report.teacherWorkload.map(t => <tr key={t.teacherId} className="border-t"><td className="p-3 font-medium">{t.teacherName}</td><td className="p-3">{t.assigned}</td><td className="p-3">{t.minimum}</td><td className="p-3">{t.target}</td><td className="p-3">{t.maximum}</td><td className="p-3">{t.freePeriods}</td><td className={`p-3 font-medium ${t.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.status === 'OK' ? '✓' : '✕'} {t.status}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      {!s.valid && <section className="rounded-xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-semibold text-rose-900">Blocking validation errors</h2><div className="mt-3 space-y-2">{report.result.errors.map((e, i) => <div key={`${e.code}-${i}`} className="text-sm text-rose-800">{e.message}</div>)}</div></section>}
    </>}
  </div>
}
