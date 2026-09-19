import type { Dataset, TimetableEntry } from '@/types'

export function scoreSchedule(entries: TimetableEntry[], data: Dataset): number {
  const activeTeachers = data.teachers.filter(t => t.active)
  const byTeacher = new Map<string, TimetableEntry[]>()
  const byClass = new Map<string, TimetableEntry[]>()

  for (const entry of entries) {
    const teacherList = byTeacher.get(entry.teacherId) ?? []
    teacherList.push(entry)
    byTeacher.set(entry.teacherId, teacherList)
    const classList = byClass.get(entry.classId) ?? []
    classList.push(entry)
    byClass.set(entry.classId, classList)
  }

  let workloadPoints = 0
  for (const teacher of activeTeachers) {
    const load = byTeacher.get(teacher.id)?.length ?? 0
    const distance = Math.abs(load - teacher.targetWeeklyPeriods)
    workloadPoints += Math.max(0, 500 / Math.max(1, activeTeachers.length) - Math.min(30, distance * 5))
  }

  let teacherFlowPenalty = 0
  for (const list of byTeacher.values()) {
    for (const day of data.settings.workingDays) {
      const occupied = new Set(list.filter(e => e.day === day).map(e => e.period))
      let consecutive = 0
      for (let period = 1; period <= data.settings.periodsPerDay; period++) {
        if (occupied.has(period)) {
          consecutive++
          if (consecutive >= 3) teacherFlowPenalty += 2
        } else {
          consecutive = 0
        }
      }
    }
  }

  let repetitionPenalty = 0
  let earlyCorePoints = 0
  for (const [classId, list] of byClass) {
    const sorted = [...list].sort((a, b) => data.settings.workingDays.indexOf(a.day) - data.settings.workingDays.indexOf(b.day) || a.period - b.period)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].day === sorted[i - 1].day && sorted[i].subjectId === sorted[i - 1].subjectId) repetitionPenalty += 4
    }
    for (const entry of list) {
      const requirement = data.classSubjects.find(r => r.classId === classId && r.subjectId === entry.subjectId)
      if ((requirement?.priority ?? 0) >= 3 && entry.period <= Math.ceil(data.settings.periodsPerDay / 2)) earlyCorePoints += 1
    }
  }

  const repetitionPoints = Math.max(0, 300 - Math.min(300, repetitionPenalty))
  const flowPoints = Math.max(0, 100 - Math.min(100, teacherFlowPenalty))
  const corePoints = Math.min(100, earlyCorePoints)
  return Math.max(1, Math.min(1000, Math.round(workloadPoints + repetitionPoints + flowPoints + corePoints)))
}
