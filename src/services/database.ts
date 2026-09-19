import { supabase, isSupabaseAvailable, markSupabaseUnavailable } from '@/lib/supabase'
import type { Dataset, TimetableEntry } from '@/types'

type PersistResult = { ok: boolean; localOnly: boolean; error?: string; code?: number }

function errorStatus(error: any) { return Number(error?.status ?? error?.code ?? 0) }
function recordSupabaseFailure(error: unknown) {
  const status = errorStatus(error)
  // A 401 is an invalid/expired API credential rather than a row-level RLS denial.
  if (status === 401 || String((error as any)?.message ?? '').toLowerCase().includes('invalid api key')) {
    markSupabaseUnavailable(error)
  }
}
function firstError(results: any[]) {
  return results.find((r) => r?.error)?.error ?? null
}

function toEntryRow(e: TimetableEntry, timetableId = e.timetableId) {
  return {
    id: e.id,
    timetable_id: timetableId,
    class_id: e.classId,
    subject_id: e.subjectId,
    teacher_id: e.teacherId,
    day: e.day,
    period: e.period,
    locked: Boolean(e.locked),
  }
}

async function deleteIds(table: string, ids: string[]) {
  if (!supabase || ids.length === 0) return
  const result = await supabase.from(table).delete().in('id', ids)
  if (result.error) throw result.error
}

function staleIds(existing: Array<{ id: string }> | null | undefined, keep: Iterable<string>) {
  const keepSet = new Set(keep)
  return (existing ?? []).map(x => x.id).filter(id => !keepSet.has(id))
}

export async function loadSchoolData(): Promise<Dataset | null> {
  if (!isSupabaseAvailable() || !supabase) return null
  try {
    const schoolResult = await supabase.from('schools').select('*').limit(1).maybeSingle()
    if (schoolResult.error) throw schoolResult.error
    if (!schoolResult.data) return null
    const school = schoolResult.data
    const schoolId = school.id

    const classesResult = await supabase.from('classes').select('*').eq('school_id', schoolId)
    const teachersResult = await supabase.from('teachers').select('*').eq('school_id', schoolId)
    const subjectsResult = await supabase.from('subjects').select('*').eq('school_id', schoolId)
    const settingsResult = await supabase.from('school_settings').select('*').eq('school_id', schoolId).maybeSingle()
    const constraintsResult = await supabase.from('constraints').select('*').eq('school_id', schoolId)
    const timetablesResult = await supabase.from('timetables').select('*').eq('school_id', schoolId).order('created_at', { ascending: true })
    const topErrors = [classesResult, teachersResult, subjectsResult, settingsResult, constraintsResult, timetablesResult]
    const topError = firstError(topErrors)
    if (topError) throw topError

    const classIds = (classesResult.data ?? []).map((x: any) => x.id)
    const teacherIds = (teachersResult.data ?? []).map((x: any) => x.id)
    const [classSubjects, assignments, availability] = await Promise.all([
      classIds.length ? supabase.from('class_subjects').select('*').in('class_id', classIds) : Promise.resolve({ data: [], error: null }),
      classIds.length ? supabase.from('teacher_assignments').select('*').in('class_id', classIds) : Promise.resolve({ data: [], error: null }),
      teacherIds.length ? supabase.from('teacher_availability').select('*').in('teacher_id', teacherIds) : Promise.resolve({ data: [], error: null }),
    ])
    const secondError = firstError([classSubjects, assignments, availability])
    if (secondError) throw secondError

    let entries: any[] = []
    const timetableRows = timetablesResult.data ?? []
    const latest = timetableRows[timetableRows.length - 1]
    if (latest) {
      const entryResult = await supabase.from('timetable_entries').select('*').eq('timetable_id', latest.id)
      if (entryResult.error) throw entryResult.error
      entries = entryResult.data ?? []
    }

    const mapSchool = (s: any) => ({ id: s.id, name: s.name, campusName: s.campus_name || '', logoUrl: s.logo_url || '', academicYear: s.academic_year || '', address: s.address || '', createdAt: s.created_at })
    return {
      school: mapSchool(school),
      settings: { id: settingsResult.data?.id || crypto.randomUUID(), schoolId, workingDays: settingsResult.data?.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], periodsPerDay: settingsResult.data?.periods_per_day || 8, periodDuration: settingsResult.data?.period_duration || 40, breakConfiguration: settingsResult.data?.break_configuration || 'Break after Period 4' },
      classes: (classesResult.data || []).map((x: any) => ({ id: x.id, schoolId, name: x.name, section: x.section || '', active: x.active, createdAt: x.created_at })),
      teachers: (teachersResult.data || []).map((x: any) => ({ id: x.id, schoolId, name: x.name, employeeId: x.employee_id || '', minWeeklyPeriods: x.min_weekly_periods, targetWeeklyPeriods: x.target_weekly_periods, maxWeeklyPeriods: x.max_weekly_periods, active: x.active, createdAt: x.created_at })),
      subjects: (subjectsResult.data || []).map((x: any) => ({ id: x.id, schoolId, name: x.name, shortName: x.short_name || '', active: x.active, createdAt: x.created_at })),
      classSubjects: (classSubjects.data || []).map((x: any) => ({ id: x.id, classId: x.class_id, subjectId: x.subject_id, weeklyPeriods: x.weekly_periods, priority: x.priority || 1 })),
      assignments: (assignments.data || []).map((x: any) => ({ id: x.id, classId: x.class_id, subjectId: x.subject_id, teacherId: x.teacher_id })),
      availability: (availability.data || []).map((x: any) => ({ id: x.id, teacherId: x.teacher_id, day: x.day, period: x.period, available: x.available })),
      constraints: (constraintsResult.data || []).map((x: any) => ({ id: x.id, schoolId: x.school_id, type: x.type, configuration: x.configuration || {} })),
      timetables: (timetablesResult.data || []).map((x: any) => ({ id: x.id, schoolId: x.school_id, name: x.name, status: x.status, createdAt: x.created_at })),
      entries: entries.map((x: any) => ({ id: x.id, timetableId: x.timetable_id, classId: x.class_id, subjectId: x.subject_id, teacherId: x.teacher_id, day: x.day, period: x.period, locked: x.locked })),
    }
  } catch (error) {
    recordSupabaseFailure(error)
    console.error('Failed to load Supabase data. Falling back to local data.', error)
    return null
  }
}

export async function saveTimetable(entries: TimetableEntry[], schoolId: string, name = 'Generated timetable') {
  if (!isSupabaseAvailable() || !supabase) return { id: crypto.randomUUID(), localOnly: true }
  let createdId: string | null = null
  try {
    const { data, error } = await supabase.from('timetables').insert({ school_id: schoolId, name, status: 'generated' }).select('id').single()
    if (error) throw error
    createdId = data.id
    const rows = entries.map(e => toEntryRow(e, data.id))
    if (rows.length) {
      const ins = await supabase.from('timetable_entries').insert(rows)
      if (ins.error) throw ins.error
    }
    return { id: data.id, localOnly: false }
  } catch (error) {
    // Avoid leaving an orphan timetable row if inserting its entries fails.
    if (createdId && supabase) {
      try { await supabase.from('timetables').delete().eq('id', createdId) } catch { /* best-effort cleanup */ }
    }
    recordSupabaseFailure(error)
    const code = errorStatus(error) || 'request error'
    const message = String((error as any)?.message || '').trim()
    const details = String((error as any)?.details || '').trim()
    const hint = String((error as any)?.hint || '').trim()
    if (code === 42501) {
      throw new Error(
        `Supabase save failed (42501): database permission denied. Your URL/key are being accepted, but the Supabase anon role does not have permission to write the timetable tables. Run the grant/RLS section in supabase.sql in Supabase SQL Editor, then reload the app. ${message || ''}`.trim()
      )
    }
    const extra = [message, details, hint].filter(Boolean).join(' | ')
    throw new Error(`Supabase save failed (${code}). ${extra || 'Check your Supabase URL/key and database permissions.'}`)
  }
}

async function persistMasterDataNow(data: Dataset): Promise<PersistResult> {
  if (!isSupabaseAvailable() || !supabase) return { ok: false, localOnly: true }
  try {
    const s = data.school

    // Parent tables must be persisted before child tables. Running these in parallel
    // can trigger foreign-key races on a fresh Supabase database.
    const schoolResult = await supabase.from('schools').upsert({
      id: s.id, name: s.name, campus_name: s.campusName, logo_url: s.logoUrl,
      academic_year: s.academicYear, address: s.address,
    })
    if (schoolResult.error) throw schoolResult.error

    const settingsResult = await supabase.from('school_settings').upsert({
      id: data.settings.id, school_id: s.id, working_days: data.settings.workingDays,
      periods_per_day: data.settings.periodsPerDay, period_duration: data.settings.periodDuration,
      break_configuration: data.settings.breakConfiguration,
    })
    if (settingsResult.error) throw settingsResult.error

    if (data.classes.length) {
      const result = await supabase.from('classes').upsert(data.classes.map(x => ({ id: x.id, school_id: s.id, name: x.name, section: x.section, active: x.active })))
      if (result.error) throw result.error
    }
    if (data.teachers.length) {
      const result = await supabase.from('teachers').upsert(data.teachers.map(x => ({ id: x.id, school_id: s.id, name: x.name, employee_id: x.employeeId, min_weekly_periods: x.minWeeklyPeriods, target_weekly_periods: x.targetWeeklyPeriods, max_weekly_periods: x.maxWeeklyPeriods, active: x.active })))
      if (result.error) throw result.error
    }
    if (data.subjects.length) {
      const result = await supabase.from('subjects').upsert(data.subjects.map(x => ({ id: x.id, school_id: s.id, name: x.name, short_name: x.shortName, active: x.active })))
      if (result.error) throw result.error
    }
    if (data.classSubjects.length) {
      const result = await supabase.from('class_subjects').upsert(data.classSubjects.map(x => ({ id: x.id, class_id: x.classId, subject_id: x.subjectId, weekly_periods: x.weeklyPeriods, priority: x.priority })))
      if (result.error) throw result.error
    }
    if (data.assignments.length) {
      const result = await supabase.from('teacher_assignments').upsert(data.assignments.map(x => ({ id: x.id, class_id: x.classId, subject_id: x.subjectId, teacher_id: x.teacherId })))
      if (result.error) throw result.error
    }
    if (data.availability.length) {
      const result = await supabase.from('teacher_availability').upsert(data.availability.map(x => ({ id: x.id, teacher_id: x.teacherId, day: x.day, period: x.period, available: x.available })))
      if (result.error) throw result.error
    }
    if (data.constraints.length) {
      const result = await supabase.from('constraints').upsert(data.constraints.map(x => ({ id: x.id, school_id: s.id, type: x.type, configuration: x.configuration })))
      if (result.error) throw result.error
    }

    // Reconcile deletions as well as inserts/updates. Without this, a record deleted in
    // the UI is still present in Supabase and returns after the next reload.
    const classIds = data.classes.map(x => x.id)
    const teacherIds = data.teachers.map(x => x.id)
    const [existingClasses, existingTeachers, existingSubjects, existingConstraints, existingClassSubjects, existingAssignments, existingAvailability] = await Promise.all([
      supabase.from('classes').select('id').eq('school_id', s.id),
      supabase.from('teachers').select('id').eq('school_id', s.id),
      supabase.from('subjects').select('id').eq('school_id', s.id),
      supabase.from('constraints').select('id').eq('school_id', s.id),
      classIds.length ? supabase.from('class_subjects').select('id').in('class_id', classIds) : Promise.resolve({ data: [], error: null }),
      classIds.length ? supabase.from('teacher_assignments').select('id').in('class_id', classIds) : Promise.resolve({ data: [], error: null }),
      teacherIds.length ? supabase.from('teacher_availability').select('id').in('teacher_id', teacherIds) : Promise.resolve({ data: [], error: null }),
    ])
    const reconcileError = firstError([existingClasses, existingTeachers, existingSubjects, existingConstraints, existingClassSubjects, existingAssignments, existingAvailability])
    if (reconcileError) throw reconcileError

    await deleteIds('class_subjects', staleIds(existingClassSubjects.data, data.classSubjects.map(x => x.id)))
    await deleteIds('teacher_assignments', staleIds(existingAssignments.data, data.assignments.map(x => x.id)))
    await deleteIds('teacher_availability', staleIds(existingAvailability.data, data.availability.map(x => x.id)))
    await deleteIds('constraints', staleIds(existingConstraints.data, data.constraints.map(x => x.id)))
    await deleteIds('classes', staleIds(existingClasses.data, classIds))
    await deleteIds('teachers', staleIds(existingTeachers.data, teacherIds))
    await deleteIds('subjects', staleIds(existingSubjects.data, data.subjects.map(x => x.id)))

    return { ok: true, localOnly: false }
  } catch (error) {
    recordSupabaseFailure(error)
    console.error('Supabase persistence failed. Local data remains active.', error)
    return {
      ok: false, localOnly: true,
      error: error instanceof Error ? error.message : String((error as any)?.message ?? 'Supabase persistence failed'),
      code: errorStatus(error),
    }
  }
}

let masterPersistQueue: Promise<PersistResult> = Promise.resolve({ ok: true, localOnly: false })
export function persistMasterData(data: Dataset): Promise<PersistResult> {
  masterPersistQueue = masterPersistQueue.then(() => persistMasterDataNow(data), () => persistMasterDataNow(data))
  return masterPersistQueue
}

let timetablePersistQueue: Promise<PersistResult> = Promise.resolve({ ok: true, localOnly: false })
export function syncTimetableEntries(timetableId: string, entries: TimetableEntry[]): Promise<PersistResult> {
  const run = async (): Promise<PersistResult> => {
    if (!isSupabaseAvailable() || !supabase) return { ok: false, localOnly: true }
    try {
      const rows = entries.map(e => toEntryRow(e, timetableId))
      if (rows.length) {
        const upsert = await supabase.from('timetable_entries').upsert(rows)
        if (upsert.error) throw upsert.error
      }
      const existing = await supabase.from('timetable_entries').select('id').eq('timetable_id', timetableId)
      if (existing.error) throw existing.error
      await deleteIds('timetable_entries', staleIds(existing.data, entries.map(e => e.id)))
      return { ok: true, localOnly: false }
    } catch (error) {
      recordSupabaseFailure(error)
      console.error('Timetable entry persistence failed. Local data remains active.', error)
      return { ok: false, localOnly: true, error: error instanceof Error ? error.message : String(error), code: errorStatus(error) }
    }
  }
  timetablePersistQueue = timetablePersistQueue.then(run, run)
  return timetablePersistQueue
}

export async function clearTimetables(schoolId: string): Promise<PersistResult> {
  if (!isSupabaseAvailable() || !supabase) return { ok: true, localOnly: true }
  try {
    const result = await supabase.from('timetables').delete().eq('school_id', schoolId)
    if (result.error) throw result.error
    return { ok: true, localOnly: false }
  } catch (error) {
    recordSupabaseFailure(error)
    return { ok: false, localOnly: false, error: error instanceof Error ? error.message : String(error), code: errorStatus(error) }
  }
}
