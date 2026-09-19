import type { Dataset, GenerationProblem, TimetableEntry, ValidationResult } from '@/types'

const classKey = (classId: string, day: string, period: number) => `${day}|${period}|${classId}`
const teacherKey = (teacherId: string, day: string, period: number) => `${day}|${period}|${teacherId}`
const requirementKey = (classId: string, subjectId: string) => `${classId}|${subjectId}`

export interface SchoolWideValidationSummary {
  teacherConflicts: number
  classConflicts: number
  missingSubjectPeriods: number
  extraSubjectPeriods: number
  teacherWorkloadViolations: number
  missingPeriods: number
  extraPeriods: number
  totalExpectedPeriods: number
  totalActualPeriods: number
  valid: boolean
}

export interface TeacherWorkloadRow {
  teacherId: string
  teacherName: string
  assigned: number
  minimum: number
  target: number
  maximum: number
  freePeriods: number
  status: 'OK' | 'Below minimum' | 'Over maximum'
}

export interface SchoolWideValidation {
  result: ValidationResult
  summary: SchoolWideValidationSummary
  teacherWorkload: TeacherWorkloadRow[]
  teacherOccupancy: Map<string, TimetableEntry[]>
}

export function validateConfiguration(data: Dataset): ValidationResult {
  const errors: GenerationProblem[] = []
  const warnings: string[] = []
  const slotsPerClass = data.settings.workingDays.length * data.settings.periodsPerDay
  const activeClasses = data.classes.filter(c => c.active)
  const activeTeachers = new Map(data.teachers.filter(t => t.active).map(t => [t.id, t]))
  const activeSubjects = new Set(data.subjects.filter(s => s.active).map(s => s.id))

  for (const cls of activeClasses) {
    const requirements = data.classSubjects.filter(r => r.classId === cls.id)
    const total = requirements.reduce((sum, r) => sum + r.weeklyPeriods, 0)
    if (total !== slotsPerClass) {
      errors.push({
        code: total < slotsPerClass ? 'CLASS_LOAD_SHORT' : 'CLASS_LOAD_EXCESS',
        message: `${cls.name}${cls.section ? `-${cls.section}` : ''} has ${total}/${slotsPerClass} periods configured.`,
      })
    }

    for (const req of requirements) {
      if (!Number.isInteger(req.weeklyPeriods) || req.weeklyPeriods < 0) {
        errors.push({ code: 'BAD_REQUIREMENT', message: `${cls.name}: weekly periods must be a non-negative integer.` })
      }
      if (!activeSubjects.has(req.subjectId)) {
        errors.push({ code: 'SUBJECT_INACTIVE', message: `${cls.name}: a configured subject is inactive or missing.` })
      }
      const matches = data.assignments.filter(a => a.classId === cls.id && a.subjectId === req.subjectId)
      if (matches.length === 0) {
        errors.push({ code: 'MISSING_TEACHER', message: `${cls.name}: subject ${req.subjectId} has no teacher assignment.` })
      } else if (matches.length > 1) {
        errors.push({ code: 'DUP_ASSIGN', message: `${cls.name}: subject ${req.subjectId} has multiple teacher assignments.` })
      } else if (!activeTeachers.has(matches[0].teacherId)) {
        errors.push({ code: 'TEACHER_INACTIVE', message: `${cls.name}: assigned teacher is inactive or missing.` })
      }
    }
  }

  const totalRequiredPeriods = activeClasses.reduce((sum, cls) => sum + data.classSubjects.filter(r => r.classId === cls.id).reduce((n, r) => n + r.weeklyPeriods, 0), 0)
  const activeTeacherList = data.teachers.filter(t => t.active)
  const aggregateMin = activeTeacherList.reduce((sum, t) => sum + Math.max(0, t.minWeeklyPeriods), 0)
  const aggregateMax = activeTeacherList.reduce((sum, t) => sum + Math.max(0, t.maxWeeklyPeriods), 0)
  if (aggregateMin > totalRequiredPeriods) {
    errors.push({ code: 'AGGREGATE_MIN_CAPACITY', message: `Impossible timetable: active teacher minimum workload is ${aggregateMin} periods, but the school has only ${totalRequiredPeriods} required teaching periods.` })
  }
  if (aggregateMax < totalRequiredPeriods) {
    errors.push({ code: 'AGGREGATE_MAX_CAPACITY', message: `Impossible timetable: active teacher maximum workload is ${aggregateMax} periods, but the school requires ${totalRequiredPeriods} teaching periods.` })
  }

  const teacherDemand = new Map<string, number>()
  for (const req of data.classSubjects) {
    const cls = data.classes.find(c => c.id === req.classId && c.active)
    if (!cls) continue
    const assignment = data.assignments.find(a => a.classId === req.classId && a.subjectId === req.subjectId)
    if (!assignment) continue
    teacherDemand.set(assignment.teacherId, (teacherDemand.get(assignment.teacherId) ?? 0) + req.weeklyPeriods)
  }

  for (const teacher of data.teachers.filter(t => t.active)) {
    if (teacher.minWeeklyPeriods < 0 || teacher.targetWeeklyPeriods < 0 || teacher.maxWeeklyPeriods < 0) {
      errors.push({ code: 'WORKLOAD_RANGE', message: `${teacher.name}: workload limits cannot be negative.` })
    }
    if (teacher.minWeeklyPeriods > teacher.targetWeeklyPeriods || teacher.targetWeeklyPeriods > teacher.maxWeeklyPeriods) {
      errors.push({ code: 'WORKLOAD_RANGE', message: `${teacher.name}: minimum, target and maximum must satisfy Min ≤ Target ≤ Max.` })
    }

    const demand = teacherDemand.get(teacher.id) ?? 0
    if (demand > teacher.maxWeeklyPeriods) {
      errors.push({
        code: 'TEACHER_DEMAND',
        message: `Impossible timetable: ${teacher.name} is assigned to ${demand} required periods but the maximum is ${teacher.maxWeeklyPeriods}.`,
      })
    }
    if (demand > slotsPerClass) {
      errors.push({
        code: 'TEACHER_SLOT_CAPACITY',
        message: `Impossible timetable: ${teacher.name} is assigned to ${demand} required periods but can teach at most ${slotsPerClass} periods because a teacher can teach only one class per day + period.`,
      })
    }
  }

  const seenAssignments = new Set<string>()
  for (const assignment of data.assignments) {
    const key = requirementKey(assignment.classId, assignment.subjectId)
    if (seenAssignments.has(key)) {
      errors.push({ code: 'DUP_ASSIGN', message: `Duplicate teacher assignment for ${assignment.classId} / ${assignment.subjectId}.` })
    }
    seenAssignments.add(key)
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function buildSchoolWideValidation(entries: TimetableEntry[], data: Dataset): SchoolWideValidation {
  const result = validateEntries(entries, data)
  const slotsPerClass = data.settings.workingDays.length * data.settings.periodsPerDay
  const activeClasses = data.classes.filter(c => c.active)
  const activeTeachers = data.teachers.filter(t => t.active)

  const teacherOccupancy = new Map<string, TimetableEntry[]>()
  const classOccupancy = new Map<string, TimetableEntry[]>()
  const exactCounts = new Map<string, number>()
  const teacherLoad = new Map<string, number>()

  for (const entry of entries) {
    const tk = teacherKey(entry.teacherId, entry.day, entry.period)
    const ck = classKey(entry.classId, entry.day, entry.period)
    teacherOccupancy.set(tk, [...(teacherOccupancy.get(tk) ?? []), entry])
    classOccupancy.set(ck, [...(classOccupancy.get(ck) ?? []), entry])
    const rk = requirementKey(entry.classId, entry.subjectId)
    exactCounts.set(rk, (exactCounts.get(rk) ?? 0) + 1)
    teacherLoad.set(entry.teacherId, (teacherLoad.get(entry.teacherId) ?? 0) + 1)
  }

  const teacherConflicts = [...teacherOccupancy.values()].reduce((n, group) => n + Math.max(0, group.length - 1), 0)
  const classConflicts = [...classOccupancy.values()].reduce((n, group) => n + Math.max(0, group.length - 1), 0)

  let missingSubjectPeriods = 0
  let extraSubjectPeriods = 0
  for (const req of data.classSubjects.filter(r => activeClasses.some(c => c.id === r.classId))) {
    const actual = exactCounts.get(requirementKey(req.classId, req.subjectId)) ?? 0
    if (actual < req.weeklyPeriods) missingSubjectPeriods += req.weeklyPeriods - actual
    if (actual > req.weeklyPeriods) extraSubjectPeriods += actual - req.weeklyPeriods
  }

  let missingPeriods = 0
  let extraPeriods = 0
  for (const cls of activeClasses) {
    const count = entries.filter(e => e.classId === cls.id).length
    if (count < slotsPerClass) missingPeriods += slotsPerClass - count
    if (count > slotsPerClass) extraPeriods += count - slotsPerClass
  }

  let teacherWorkloadViolations = 0
  const teacherWorkload: TeacherWorkloadRow[] = activeTeachers.map(teacher => {
    const assigned = teacherLoad.get(teacher.id) ?? 0
    const status: TeacherWorkloadRow['status'] = assigned > teacher.maxWeeklyPeriods ? 'Over maximum' : assigned < teacher.minWeeklyPeriods ? 'Below minimum' : 'OK'
    if (status !== 'OK') teacherWorkloadViolations++
    return {
      teacherId: teacher.id,
      teacherName: teacher.name,
      assigned,
      minimum: teacher.minWeeklyPeriods,
      target: teacher.targetWeeklyPeriods,
      maximum: teacher.maxWeeklyPeriods,
      freePeriods: Math.max(0, slotsPerClass - assigned),
      status,
    }
  })

  const summary: SchoolWideValidationSummary = {
    teacherConflicts,
    classConflicts,
    missingSubjectPeriods,
    extraSubjectPeriods,
    teacherWorkloadViolations,
    missingPeriods,
    extraPeriods,
    totalExpectedPeriods: activeClasses.length * slotsPerClass,
    totalActualPeriods: entries.filter(e => activeClasses.some(c => c.id === e.classId)).length,
    valid: teacherConflicts === 0 && classConflicts === 0 && missingSubjectPeriods === 0 && extraSubjectPeriods === 0 && teacherWorkloadViolations === 0 && missingPeriods === 0 && extraPeriods === 0 && result.valid,
  }

  return { result, summary, teacherWorkload, teacherOccupancy }
}

export function validateEntries(entries: TimetableEntry[], data: Dataset): ValidationResult {
  const base = validateConfiguration(data)
  const errors = [...base.errors]
  const warnings = [...base.warnings]
  const activeClasses = data.classes.filter(c => c.active)
  const activeClassIds = new Set(activeClasses.map(c => c.id))
  const classBusy = new Set<string>()
  const teacherBusy = new Set<string>()
  const exactCounts = new Map<string, number>()
  const expectedSlots = data.settings.workingDays.length * data.settings.periodsPerDay
  const validDay = new Set(data.settings.workingDays)
  const teacherLoad = new Map<string, number>()

  for (const entry of entries) {
    if (!activeClassIds.has(entry.classId)) {
      errors.push({ code: 'UNKNOWN_CLASS', message: `Timetable entry ${entry.id} references an inactive or missing class.` })
    }
    if (!validDay.has(entry.day) || entry.period < 1 || entry.period > data.settings.periodsPerDay) {
      errors.push({ code: 'BAD_SLOT', message: `Timetable entry ${entry.id} uses an invalid day or period.` })
    }

    const ckey = classKey(entry.classId, entry.day, entry.period)
    const tkey = teacherKey(entry.teacherId, entry.day, entry.period)
    const rkey = requirementKey(entry.classId, entry.subjectId)

    if (classBusy.has(ckey)) errors.push({ code: 'CLASS_CONFLICT', message: `Class conflict at ${entry.day} Period ${entry.period} for class ${entry.classId}.` })
    classBusy.add(ckey)

    if (teacherBusy.has(tkey)) errors.push({ code: 'TEACHER_CONFLICT', message: `Teacher conflict: ${entry.teacherId} is assigned more than once at ${entry.day} Period ${entry.period}.` })
    teacherBusy.add(tkey)

    exactCounts.set(rkey, (exactCounts.get(rkey) ?? 0) + 1)
    teacherLoad.set(entry.teacherId, (teacherLoad.get(entry.teacherId) ?? 0) + 1)

    const assignment = data.assignments.find(a => a.classId === entry.classId && a.subjectId === entry.subjectId)
    if (!assignment) {
      errors.push({ code: 'MISSING_ASSIGNMENT', message: `Entry for ${entry.classId} / ${entry.subjectId} has no configured teacher assignment.` })
    } else if (assignment.teacherId !== entry.teacherId) {
      errors.push({ code: 'WRONG_TEACHER', message: `Incorrect teacher for ${entry.classId} / ${entry.subjectId}: expected ${assignment.teacherId}.` })
    }

    const availability = data.availability.find(a => a.teacherId === entry.teacherId && a.day === entry.day && a.period === entry.period)
    if (availability?.available === false) {
      errors.push({ code: 'UNAVAILABLE', message: `${entry.teacherId} is unavailable on ${entry.day} Period ${entry.period}.` })
    }
  }

  for (const cls of activeClasses) {
    const count = entries.filter(e => e.classId === cls.id).length
    if (count !== expectedSlots) {
      errors.push({ code: count < expectedSlots ? 'MISSING_PERIODS' : 'EXTRA_PERIODS', message: `${cls.name}${cls.section ? `-${cls.section}` : ''} has ${count}/${expectedSlots} scheduled periods.` })
    }
  }

  for (const req of data.classSubjects.filter(r => activeClassIds.has(r.classId))) {
    const key = requirementKey(req.classId, req.subjectId)
    const actual = exactCounts.get(key) ?? 0
    if (actual !== req.weeklyPeriods) {
      errors.push({ code: actual < req.weeklyPeriods ? 'MISSING_SUBJECT_PERIODS' : 'EXTRA_SUBJECT_PERIODS', message: `Class ${req.classId}, subject ${req.subjectId} is scheduled ${actual}/${req.weeklyPeriods} times.` })
    }
  }

  for (const teacher of data.teachers.filter(t => t.active)) {
    const load = teacherLoad.get(teacher.id) ?? 0
    if (load > teacher.maxWeeklyPeriods) {
      errors.push({ code: 'TEACHER_MAX', message: `${teacher.name} has ${load} assigned periods, exceeding maximum ${teacher.maxWeeklyPeriods}.` })
    }
    if (load < teacher.minWeeklyPeriods) {
      errors.push({ code: 'TEACHER_MIN', message: `${teacher.name} has ${load} assigned periods, below minimum ${teacher.minWeeklyPeriods}.` })
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
