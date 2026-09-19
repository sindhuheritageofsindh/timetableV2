import type { Dataset } from '@/types'

const now = new Date().toISOString()
const sid = '00000000-0000-4000-8000-000000000001'

const demoUuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const classIds = Array.from({ length: 10 }, (_, i) => demoUuid(101 + i))
const teacherNames = [
  'Muskan Solangi',
  'Zohaib',
  'Rida',
  'Shaikh Muskan',
  'Urooj',
  'Benazir',
  'Anila',
  'Nadeem',
  'Shoaib',
  'Sobh',
  'Sasui',
  'Fiza Bhutto',
  'Adeel',
  'Saira',
  'Tanveer',
]
const teacherIds = teacherNames.map((_, i) => demoUuid(201 + i))

const subjectNames = [
  'English',
  'Urdu',
  'Math',
  'General Science',
  'GK',
  'Ethics',
  'Islamiyat',
  'Computer Science',
  'Sindhi',
  'Social Study/Pak Study',
  'Physics',
  'Chemistry',
  'Biology',
  'P.T.',
]
const subjectIds = subjectNames.map((_, i) => demoUuid(301 + i))

const classNames = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

const teacherIndex = new Map(teacherNames.map((name, i) => [name, i]))
const subjectIndex = new Map(subjectNames.map((name, i) => [name, i]))

/**
 * Teacher mapping transcribed from the supplied school timetable reference.
 * null means that subject is not configured for that class.
 */
const teachingMap: Record<string, Array<string | null>> = {
  English: ['Muskan Solangi', 'Muskan Solangi', 'Muskan Solangi', 'Zohaib', 'Zohaib', 'Rida', 'Rida', 'Rida', 'Rida', 'Rida'],
  Urdu: ['Shaikh Muskan', 'Urooj', 'Benazir', 'Benazir', 'Benazir', 'Benazir', 'Benazir', 'Benazir', null, 'Anila'],
  Math: ['Nadeem', 'Nadeem', 'Nadeem', 'Nadeem', 'Nadeem', 'Shoaib', 'Shoaib', 'Shoaib', 'Shoaib', 'Shoaib'],
  'General Science': [null, null, null, 'Sobh', 'Sobh', 'Sasui', 'Sasui', 'Sasui', null, null],
  GK: ['Sobh', 'Sobh', 'Sobh', null, null, null, null, null, null, null],
  Ethics: ['Urooj', 'Urooj', 'Urooj', 'Urooj', 'Fiza Bhutto', 'Fiza Bhutto', 'Fiza Bhutto', 'Fiza Bhutto', 'Fiza Bhutto', null],
  Islamiyat: ['Shaikh Muskan', 'Urooj', 'Anila', 'Anila', 'Anila', 'Anila', 'Anila', 'Anila', 'Anila', null],
  'Computer Science': ['Shaikh Muskan', 'Shaikh Muskan', 'Adeel', 'Adeel', 'Adeel', 'Adeel', 'Adeel', 'Adeel', null, null],
  Sindhi: ['Urooj', 'Urooj', 'Saira', 'Saira', 'Saira', 'Saira', 'Saira', 'Saira', 'Saira', null],
  'Social Study/Pak Study': [null, null, null, 'Muskan Solangi', 'Muskan Solangi', 'Zohaib', 'Zohaib', 'Zohaib', null, 'Shaikh Muskan'],
  Physics: [null, null, null, null, null, null, null, null, 'Tanveer', 'Tanveer'],
  Chemistry: [null, null, null, null, null, null, null, null, 'Sasui', 'Sasui'],
  Biology: [null, null, null, null, null, null, null, null, 'Tanveer', 'Tanveer'],
  'P.T.': ['Fiza Bhutto', 'Fiza Bhutto', 'Fiza Bhutto', 'Fiza Bhutto', 'Fiza Bhutto', 'Shaikh Muskan', 'Shaikh Muskan', 'Shaikh Muskan', 'Shaikh Muskan', 'Shaikh Muskan'],
}

// Reference-data weekly requirements. The supplied image specifies teacher mappings,
// but not weekly frequencies, so these are practical generator-ready frequencies
// that make every active class exactly 40 periods while preserving those mappings.
const weeklyPeriodsByClass: Record<number, Record<string, number>> = {
  0: { English: 6, Urdu: 5, Math: 5, GK: 6, Ethics: 4, Islamiyat: 3, 'Computer Science': 3, Sindhi: 4, 'P.T.': 4 },
  1: { English: 6, Urdu: 5, Math: 6, GK: 6, Ethics: 3, Islamiyat: 3, 'Computer Science': 3, Sindhi: 4, 'P.T.': 4 },
  2: { English: 6, Urdu: 5, Math: 5, GK: 5, Ethics: 2, Islamiyat: 3, 'Computer Science': 6, Sindhi: 4, 'P.T.': 4 },
  3: { English: 6, Urdu: 5, Math: 5, 'General Science': 4, Ethics: 2, Islamiyat: 3, 'Computer Science': 4, Sindhi: 4, 'Social Study/Pak Study': 3, 'P.T.': 4 },
  4: { English: 6, Urdu: 5, Math: 5, 'General Science': 4, Ethics: 2, Islamiyat: 3, 'Computer Science': 4, Sindhi: 4, 'Social Study/Pak Study': 3, 'P.T.': 4 },
  5: { English: 5, Urdu: 5, Math: 5, 'General Science': 6, Ethics: 2, Islamiyat: 3, 'Computer Science': 3, Sindhi: 4, 'Social Study/Pak Study': 3, 'P.T.': 4 },
  6: { English: 5, Urdu: 5, Math: 5, 'General Science': 5, Ethics: 2, Islamiyat: 3, 'Computer Science': 3, Sindhi: 4, 'Social Study/Pak Study': 4, 'P.T.': 4 },
  7: { English: 5, Urdu: 5, Math: 5, 'General Science': 5, Ethics: 2, Islamiyat: 3, 'Computer Science': 3, Sindhi: 4, 'Social Study/Pak Study': 4, 'P.T.': 4 },
  8: { English: 6, Math: 6, Ethics: 2, Islamiyat: 3, Sindhi: 3, Physics: 6, Chemistry: 6, Biology: 6, 'P.T.': 2 },
  9: { English: 6, Urdu: 6, Math: 6, 'Social Study/Pak Study': 3, Physics: 6, Chemistry: 5, Biology: 6, 'P.T.': 2 },
}

function weeklyPeriodsFor(subject: string, classIndex: number) {
  return weeklyPeriodsByClass[classIndex]?.[subject] ?? 0
}

function requiredPeriodsForTeacher(name: string) {
  let total = 0
  for (const [subject, teachers] of Object.entries(teachingMap)) {
    teachers.forEach((teacher, classIndex) => {
      if (teacher === name) total += weeklyPeriodsFor(subject, classIndex)
    })
  }
  return total
}

export function buildDemoDataset(): Dataset {
  const classes = classIds.map((id, i) => ({
    id,
    schoolId: sid,
    name: classNames[i],
    section: '',
    active: true,
    createdAt: now,
  }))

  const subjects = subjectIds.map((id, i) => ({
    id,
    schoolId: sid,
    name: subjectNames[i],
    shortName: subjectNames[i].length > 12 ? subjectNames[i].slice(0, 10).toUpperCase() : subjectNames[i].slice(0, 4).toUpperCase(),
    active: true,
    createdAt: now,
  }))

  const teachers = teacherIds.map((id, i) => {
    const required = requiredPeriodsForTeacher(teacherNames[i])
    // Keep the reference dataset generator-ready while retaining configurable workload fields.
    const target = required
    const min = Math.max(0, required - 2)
    const max = Math.max(33, required + 1)
    return {
      id,
      schoolId: sid,
      name: teacherNames[i],
      employeeId: `T-${100 + i}`,
      minWeeklyPeriods: min,
      targetWeeklyPeriods: target,
      maxWeeklyPeriods: max,
      active: true,
      createdAt: now,
    }
  })

  const classSubjects: Dataset['classSubjects'] = []
  const assignments: Dataset['assignments'] = []

  for (let classIndex = 0; classIndex < classes.length; classIndex++) {
    for (const subject of subjectNames) {
      const teacherName = teachingMap[subject][classIndex]
      const weeklyPeriods = weeklyPeriodsFor(subject, classIndex)
      if (!teacherName || weeklyPeriods <= 0) continue

      const subjectId = subjectIds[subjectIndex.get(subject)!]
      const classId = classIds[classIndex]
      const teacherId = teacherIds[teacherIndex.get(teacherName)!]

      classSubjects.push({
        id: demoUuid(1001 + classIndex * 100 + (subjectIndex.get(subject)! + 1)),
        classId,
        subjectId,
        weeklyPeriods,
        priority: ['Math', 'English', 'General Science', 'Physics', 'Chemistry', 'Biology'].includes(subject) ? 3 : 2,
      })

      assignments.push({
        id: demoUuid(2001 + classIndex * 100 + (subjectIndex.get(subject)! + 1)),
        classId,
        subjectId,
        teacherId,
      })
    }
  }

  return {
    school: {
      id: sid,
      name: 'The Smart School',
      campusName: 'Larkana Campus',
      logoUrl: '',
      academicYear: '2026-27',
      address: 'Larkana, Sindh, Pakistan',
      createdAt: now,
    },
    settings: {
      id: demoUuid(401),
      schoolId: sid,
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      periodsPerDay: 8,
      periodDuration: 40,
      breakConfiguration: 'Break after Period 4',
    },
    classes,
    teachers,
    subjects,
    classSubjects,
    assignments,
    availability: [],
    constraints: [],
    timetables: [],
    entries: [],
  }
}

export function attachSchoolId(dataset: Dataset, schoolId: string): Dataset {
  return {
    ...dataset,
    school: { ...dataset.school, id: schoolId },
    settings: { ...dataset.settings, schoolId },
    classes: dataset.classes.map(x => ({ ...x, schoolId })),
    teachers: dataset.teachers.map(x => ({ ...x, schoolId })),
    subjects: dataset.subjects.map(x => ({ ...x, schoolId })),
    constraints: dataset.constraints.map(x => ({ ...x, schoolId })),
  }
}
