import { useMemo, useState } from 'react'
import { Download, Lock, Unlock, RefreshCw } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { useApp } from '@/App'
import { TimetablePdf } from '@/pdf/TimetablePdf'
import { validateEntries } from '@/engine/validator'
import { clearTimetables } from '@/services/database'

export function TimetablePage() {
  const { data, setData, generate, generating } = useApp()
  const [view, setView] = useState<'class' | 'teacher' | 'master'>('class')
  const [selectedClass, setSelectedClass] = useState(data.classes[0]?.id || '')
  const [selectedTeacher, setSelectedTeacher] = useState(data.teachers[0]?.id || '')
  const latest = data.timetables.at(-1)
  const entries = latest ? data.entries.filter(e => e.timetableId === latest.id) : []
  const validation = validateEntries(entries, data)
  const displayEntries = useMemo(
    () => view === 'class' ? entries.filter(e => e.classId === selectedClass) : view === 'teacher' ? entries.filter(e => e.teacherId === selectedTeacher) : entries,
    [entries, view, selectedClass, selectedTeacher],
  )

  const cell = (day: string, period: number) => displayEntries.find(e => e.day === day && e.period === period)

  const edit = (day: string, period: number) => {
    if (!latest) {
      alert('Generate a timetable first.')
      return
    }
    const current = cell(day, period)
    if (view === 'master' || (!current && view !== 'class')) return
    const cls = current?.classId || selectedClass
    const subject = current?.subjectId || data.subjects[0]?.id
    const teacher = current?.teacherId || data.assignments.find(a => a.classId === cls && a.subjectId === subject)?.teacherId || data.teachers[0]?.id
    if (!cls || !subject || !teacher) return

    const subjectId = prompt('Subject ID', subject)
    const teacherId = prompt('Teacher ID', teacher)
    if (!subjectId || !teacherId) return

    const configuredSubject = data.subjects.find(s => s.id === subjectId && s.active)
    if (!configuredSubject) {
      alert('Invalid subject: use an active configured Subject ID.')
      return
    }
    const configuredTeacher = data.teachers.find(t => t.id === teacherId && t.active)
    if (!configuredTeacher) {
      alert('Invalid teacher: use an active configured Teacher ID.')
      return
    }
    const configuredAssignment = data.assignments.find(a => a.classId === cls && a.subjectId === subjectId)
    if (!configuredAssignment || configuredAssignment.teacherId !== teacherId) {
      alert('This teacher is not the configured teacher for the selected class + subject.')
      return
    }
    if (data.availability.some(a => a.teacherId === teacherId && a.day === day && a.period === period && a.available === false)) {
      alert(`${configuredTeacher.name} is unavailable during this period.`)
      return
    }

    const classConflict = entries.find(e => e.id !== current?.id && e.classId === cls && e.day === day && e.period === period)
    const teacherConflict = entries.find(e => e.id !== current?.id && e.teacherId === teacherId && e.day === day && e.period === period)
    if (classConflict) {
      alert('Conflict: this class already has an entry during this period.')
      return
    }
    if (teacherConflict) {
      const c = data.classes.find(x => x.id === teacherConflict.classId)
      alert(`Conflict: ${configuredTeacher.name} is already teaching ${c?.name || 'another class'} during this period.`)
      return
    }

    const currentTeacherContribution = current?.teacherId === teacherId ? 1 : 0
    const currentTeacherLoad = entries.filter(e => e.teacherId === teacherId).length
    if (currentTeacherLoad - currentTeacherContribution + 1 > configuredTeacher.maxWeeklyPeriods) {
      alert(`${configuredTeacher.name} would exceed the configured maximum weekly workload.`)
      return
    }

    setData(d => {
      const next = d.entries.filter(e => e.id !== current?.id)
      next.push({
        id: current?.id || crypto.randomUUID(),
        timetableId: latest.id,
        classId: cls,
        subjectId,
        teacherId,
        day,
        period,
        locked: current?.locked || false,
      })
      return { ...d, entries: next }
    })
  }

  const toggleLock = (eId: string) => setData(d => ({ ...d, entries: d.entries.map(e => e.id === eId ? { ...e, locked: !e.locked } : e) }))

  const pdfTitle = (kind: 'class' | 'teacher' | 'master') => {
    if (kind === 'master') return 'Master Timetable'
    if (kind === 'teacher') {
      const t = data.teachers.find(x => x.id === selectedTeacher)
      return t ? `Teacher ${t.name} Timetable` : 'Teacher Timetable'
    }
    const c = data.classes.find(x => x.id === selectedClass)
    return c ? `Class ${c.section ? `${c.name}-${c.section}` : c.name} Timetable` : 'Class Timetable'
  }

  const safeFilename = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').trim()

  const doPdf = async (kind: 'class' | 'teacher' | 'master') => {
    const blob = await pdf(<TimetablePdf data={data} entries={entries} title={pdfTitle(kind)} filterClassId={kind === 'class' ? selectedClass : undefined} filterTeacherId={kind === 'teacher' ? selectedTeacher : undefined} referenceMatrix={kind === 'master'} />).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fileBase = kind === 'class'
      ? (data.classes.find(c => c.id === selectedClass)?.section
          ? `class-${data.classes.find(c => c.id === selectedClass)?.name}-${data.classes.find(c => c.id === selectedClass)?.section}`
          : `class-${data.classes.find(c => c.id === selectedClass)?.name || 'timetable'}`)
      : kind === 'teacher'
        ? `teacher-${data.teachers.find(t => t.id === selectedTeacher)?.name || 'timetable'}`
        : 'master-timetable'
    a.download = `${safeFilename(fileBase)}-timetable.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetTimetable = async () => {
    if (!confirm('Reset the current generated timetable?')) return
    const result = await clearTimetables(data.school.id)
    if (!result.ok && !result.localOnly) {
      alert(`Could not reset the cloud timetable. ${result.error || 'Please try again.'}`)
      return
    }
    setData(d => ({ ...d, entries: [], timetables: [] }))
  }

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Timetable</h1><p className="mt-1 text-sm text-slate-500">Edit safely, lock cells, regenerate, and export to PDF.</p></div>
      <div className="flex gap-2">
        <button disabled={generating} onClick={async () => { const r = await generate(entries.filter(e => e.locked)); alert(r.message) }} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15}/>{generating ? 'Generating' : 'Regenerate'}</button>
        {view === 'class' && <button disabled={generating} onClick={async () => { const preserved = entries.filter(e => e.classId !== selectedClass); const r = await generate([...preserved, ...entries.filter(e => e.classId === selectedClass && e.locked)]); alert(r.message) }} className="rounded-lg border px-3 py-2 text-sm">Regenerate selected class</button>}
        <button onClick={resetTimetable} className="rounded-lg border px-3 py-2 text-sm text-rose-600">Reset</button>
        <button onClick={() => doPdf(view)} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Download size={15}/> PDF</button>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-3">
      <div className="flex rounded-lg bg-slate-100 p-1">{(['class', 'teacher', 'master'] as const).map(x => <button key={x} onClick={() => setView(x)} className={`rounded-md px-3 py-1.5 text-sm ${view === x ? 'bg-white shadow-sm' : 'text-slate-600'}`}>{x[0].toUpperCase() + x.slice(1)} View</button>)}</div>
      {view === 'class' && <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">{data.classes.map(c => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select>}
      {view === 'teacher' && <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">{data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      <div className={`ml-auto self-center text-xs ${validation.valid ? 'text-emerald-600' : 'text-rose-600'}`}>{validation.valid ? 'Valid timetable' : `${validation.errors.length} issues`}</div>
    </div>
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[800px] w-full border-collapse text-sm">
        <thead><tr><th className="sticky left-0 z-10 border-b border-r bg-slate-50 p-3 text-left">Period</th>{data.settings.workingDays.map(d => <th key={d} className="border-b bg-slate-50 p-3 text-left">{d}</th>)}</tr></thead>
        <tbody>{Array.from({ length: data.settings.periodsPerDay }, (_, i) => i + 1).map(p => <tr key={p}><td className="sticky left-0 z-10 border-r border-b bg-white p-3 font-medium">{p}</td>{data.settings.workingDays.map(d => { const e = cell(d, p), s = e && data.subjects.find(x => x.id === e.subjectId), t = e && data.teachers.find(x => x.id === e.teacherId); return <td key={d} className={`group min-w-[135px] border-b p-2 align-top ${e ? '' : 'bg-slate-50/40'}`} onDoubleClick={() => edit(d, p)}><div className="min-h-[56px] rounded-lg border border-transparent p-2 hover:border-slate-300">{e ? <><div className="font-medium">{s?.shortName || s?.name}</div><div className="mt-1 text-xs text-slate-500">{t?.name}</div><div className="mt-2 flex items-center justify-between"><button onClick={() => toggleLock(e.id)} className="text-slate-400 hover:text-slate-900">{e.locked ? <Lock size={14}/> : <Unlock size={14}/>}</button><span className="text-[10px] text-slate-400">double-click edit</span></div></> : <button onClick={() => edit(d, p)} className="h-full w-full text-left text-xs text-slate-400">+ assign</button>}</div></td>})}</tr>)}</tbody>
      </table>
    </div>
    <div className="text-xs text-slate-400">Manual editing uses school-wide conflict checks. Double-click a cell to edit; the master timetable is always validated across all active classes.</div>
  </div>
}
