import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { useApp } from '@/App'
import { validateEntries } from '@/engine/validator'

export function Rules() {
  const { data, setData } = useApp()
  const [teacher, setTeacher] = useState(data.teachers[0]?.id || '')
  const [day, setDay] = useState(data.settings.workingDays[0])
  const [period, setPeriod] = useState(1)
  const latest = data.timetables[data.timetables.length - 1]
  const entries = latest ? data.entries.filter(e => e.timetableId === latest.id) : []
  const timetableValidation = useMemo(() => validateEntries(entries, data), [entries, data])
  const row = data.availability.find(a => a.teacherId === teacher && a.day === day && a.period === period)

  const workload = useMemo(() => {
    const loads = new Map<string, number>()
    entries.forEach(e => loads.set(e.teacherId, (loads.get(e.teacherId) ?? 0) + 1))
    return data.teachers.filter(t => t.active).map(t => {
      const assigned = loads.get(t.id) ?? 0
      const status = assigned > t.maxWeeklyPeriods ? 'Over max' : assigned < t.minWeeklyPeriods ? 'Below min' : 'OK'
      return { ...t, assigned, status }
    })
  }, [entries, data.teachers])

  const conflictCount = (code: string) => timetableValidation.errors.filter(e => e.code === code).length
  const workloadViolations = data.teachers.filter(t => t.active).filter(t => { const assigned = entries.filter(e => e.teacherId === t.id).length; return assigned < t.minWeeklyPeriods || assigned > t.maxWeeklyPeriods }).length
  const setAvailability = (available: boolean) => setData(d => {
    const existing = d.availability.find(a => a.teacherId === teacher && a.day === day && a.period === period)
    const next = existing
      ? d.availability.map(a => a.id === existing.id ? { ...a, available } : a)
      : [...d.availability, { id: crypto.randomUUID(), teacherId: teacher, day, period, available }]
    return { ...d, availability: next }
  })

  const Check = ({ ok }: { ok: boolean }) => ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <XCircle size={15} className="text-rose-600" />

  return <div className="mx-auto max-w-7xl space-y-5">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-slate-500">Hard constraints, availability, and generation health.</p>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Teacher availability</h2>
        <p className="mt-1 text-sm text-slate-500">Explicitly mark unavailable periods. Unlisted periods are treated as available.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <select value={teacher} onChange={e => setTeacher(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">{data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={day} onChange={e => setDay(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">{data.settings.workingDays.map(d => <option key={d}>{d}</option>)}</select>
          <select value={period} onChange={e => setPeriod(Number(e.target.value))} className="rounded-lg border px-3 py-2 text-sm">{Array.from({ length: data.settings.periodsPerDay }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setAvailability(true)} className={`rounded-lg px-4 py-2 text-sm font-medium ${row?.available !== false ? 'bg-slate-900 text-white' : 'border text-slate-600'}`}>Available</button>
          <button onClick={() => setAvailability(false)} className={`rounded-lg px-4 py-2 text-sm font-medium ${row?.available === false ? 'bg-slate-900 text-white' : 'border text-slate-600'}`}>Unavailable</button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Validation report</h2>
        <div className="mt-4 space-y-2">
          {timetableValidation.errors.length === 0
            ? <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">Configuration and current timetable are valid.</div>
            : <div className="max-h-80 space-y-2 overflow-auto">{timetableValidation.errors.map((e, i) => <div key={`${e.code}-${i}`} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{e.message}</div>)}</div>}
          {timetableValidation.warnings.map((w, i) => <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{w}</div>)}
        </div>
      </section>
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Scheduling debug</h2>
          <p className="mt-1 text-sm text-slate-500">School-wide validation of the latest generated timetable.</p>
        </div>
        <div className="text-xs text-slate-500">{latest ? 'Latest timetable checked' : 'No generated timetable yet'}</div>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-[720px] w-full text-sm">
          <thead><tr className="bg-slate-50 text-left"><th className="p-3">Teacher</th><th className="p-3">Assigned</th><th className="p-3">Target</th><th className="p-3">Min</th><th className="p-3">Max</th><th className="p-3">Status</th></tr></thead>
          <tbody>{workload.map(t => <tr key={t.id} className="border-t"><td className="p-3 font-medium">{t.name}</td><td className="p-3">{t.assigned}</td><td className="p-3">{t.targetWeeklyPeriods}</td><td className="p-3">{t.minWeeklyPeriods}</td><td className="p-3">{t.maxWeeklyPeriods}</td><td className={`p-3 font-medium ${t.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.status === 'OK' ? '✓' : '✕'} {t.status}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-600">For the complete school-wide pass, use the dedicated validation screen.</div><Link to="/validation" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50">School-wide Validation <ExternalLink size={14}/></Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm"><Check ok={conflictCount('TEACHER_CONFLICT') === 0} />Teacher conflicts</div><div className="mt-1 text-xl font-semibold">{conflictCount('TEACHER_CONFLICT')}</div></div>
        <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm"><Check ok={conflictCount('CLASS_CONFLICT') === 0} />Class conflicts</div><div className="mt-1 text-xl font-semibold">{conflictCount('CLASS_CONFLICT')}</div></div>
        <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm"><Check ok={conflictCount('MISSING_PERIODS') === 0} />Missing periods</div><div className="mt-1 text-xl font-semibold">{conflictCount('MISSING_PERIODS')}</div></div>
        <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm"><Check ok={conflictCount('EXTRA_PERIODS') === 0} />Extra periods</div><div className="mt-1 text-xl font-semibold">{conflictCount('EXTRA_PERIODS')}</div></div><div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm"><Check ok={workloadViolations === 0} />Teacher workload violations</div><div className="mt-1 text-xl font-semibold">{workloadViolations}</div></div>
      </div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Scheduling preferences</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">Core-subject bias<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option>Prefer earlier periods</option><option>Neutral</option></select></label>
        <label className="text-sm">Subject repetition<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option>Avoid same-day duplicates</option><option>Allow</option></select></label>
        <label className="text-sm">Teacher gaps<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option>Balanced</option><option>Compact</option></select></label>
        <label className="text-sm">Priority scale<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option>Respect configured priority</option></select></label>
      </div>
      <div className="mt-3 text-xs text-slate-500">These UI preferences are advisory; hard constraints always win.</div>
    </section>
  </div>
}
