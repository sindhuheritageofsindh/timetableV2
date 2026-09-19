import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { Dataset, TimetableEntry } from '@/types'

type Props = {
  data: Dataset
  entries: TimetableEntry[]
  title?: string
  filterClassId?: string
  filterTeacherId?: string
  referenceMatrix?: boolean
}

const RED = '#B00000'
const BLACK = '#111111'
const GRID = '#555555'

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontFamily: 'Times-Roman',
    color: BLACK,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 78,
    marginBottom: 7,
  },
  logoBox: {
    width: 78,
    height: 70,
    marginRight: 12,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logo: {
    width: 74,
    height: 66,
    objectFit: 'contain',
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolName: {
    color: RED,
    fontFamily: 'Times-Bold',
    fontSize: 35,
    lineHeight: 1,
    textAlign: 'center',
  },
  campus: {
    color: BLACK,
    fontFamily: 'Times-Bold',
    fontSize: 20,
    marginTop: 3,
    textAlign: 'center',
  },
  motto: {
    color: RED,
    fontFamily: 'Times-Bold',
    fontSize: 7,
    textAlign: 'left',
    marginTop: 3,
  },
  topRule: {
    height: 2,
    backgroundColor: RED,
    marginBottom: 3,
  },
  secondRule: {
    height: 1,
    backgroundColor: RED,
    marginBottom: 6,
  },
  matrix: {
    borderWidth: 1,
    borderColor: GRID,
  },
  row: {
    flexDirection: 'row',
  },
  headCell: {
    backgroundColor: RED,
    color: '#FFFFFF',
    fontFamily: 'Times-Bold',
    fontSize: 10,
    textAlign: 'center',
    paddingTop: 5,
    paddingBottom: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: GRID,
    flex: 1,
    minHeight: 28,
    justifyContent: 'center',
  },
  headSubject: {
    flexGrow: 1.55,
    flexBasis: 92,
  },
  dataSubject: {
    flexGrow: 1.55,
    flexBasis: 92,
    fontFamily: 'Times-Bold',
    fontSize: 9.5,
    textAlign: 'left',
  },
  dataCell: {
    flex: 1,
    minHeight: 31,
    paddingTop: 4,
    paddingBottom: 3,
    paddingLeft: 2,
    paddingRight: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: GRID,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subjectLabel: {
    fontFamily: 'Times-Bold',
    fontSize: 9.5,
    lineHeight: 1.05,
  },
  teacherLabel: {
    fontFamily: 'Times-Roman',
    fontSize: 8.2,
    lineHeight: 1.05,
    textAlign: 'center',
  },
  unavailable: {
    fontFamily: 'Times-Roman',
    fontSize: 9,
    textAlign: 'center',
  },

  // Weekly layout retained for class/teacher exports.
  weeklyTitle: { fontFamily: 'Times-Bold', fontSize: 21, marginBottom: 4, color: RED, textAlign: 'center' },
  weeklyMeta: { fontFamily: 'Times-Roman', fontSize: 8.5, textAlign: 'center', marginBottom: 10 },
  weeklyTable: { borderWidth: 1, borderColor: GRID },
  weeklyRow: { flexDirection: 'row' },
  weeklyHead: { backgroundColor: RED, color: '#FFFFFF', fontFamily: 'Times-Bold' },
  weeklyCell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID, padding: 4, flexGrow: 1, flexBasis: 70, minHeight: 34, justifyContent: 'center' },
  weeklyPeriod: { flexBasis: 43, flexGrow: 0 },
  weeklySmall: { fontSize: 7.2, marginTop: 2, textAlign: 'center' },
  weeklyBodyText: { fontSize: 8.2, textAlign: 'center' },
})

function classLabel(c: Dataset['classes'][number]) {
  return c.section ? `${c.name}-${c.section}` : c.name
}

function fitFont(classCount: number) {
  if (classCount <= 8) return 10
  if (classCount <= 10) return 9.7
  if (classCount <= 12) return 9
  if (classCount <= 16) return 8
  return 7
}

function fitRowHeight(subjectCount: number) {
  if (subjectCount <= 14) return 31
  if (subjectCount <= 16) return 28
  if (subjectCount <= 20) return 24
  return 21
}

function ReferenceMatrix({ data }: { data: Dataset }) {
  const classes = data.classes.filter(c => c.active)
  const subjects = data.subjects.filter(s => s.active)
  const teacherByClassSubject = new Map(
    data.assignments.map(a => [`${a.classId}:${a.subjectId}`, a.teacherId]),
  )
  const teacherById = new Map(data.teachers.map(t => [t.id, t]))
  const reqByClassSubject = new Map(data.classSubjects.map(r => [`${r.classId}:${r.subjectId}`, r]))
  const fontSize = fitFont(classes.length)
  const rowHeight = fitRowHeight(subjects.length)

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.logoBox}>
          {data.school.logoUrl ? <Image src={data.school.logoUrl} style={styles.logo} /> : null}
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.schoolName, { fontSize: data.school.name.length > 24 ? 29 : 35 }]}>{data.school.name}</Text>
          <Text style={styles.campus}>({data.school.campusName || 'Main Campus'})</Text>
        </View>
        <View style={{ width: 78 }} />
      </View>

      <View style={styles.topRule} />
      <View style={styles.secondRule} />

      <View style={styles.matrix} wrap={false}>
        <View style={styles.row}>
          <View style={[styles.headCell, styles.headSubject]}>
            <Text>Class</Text>
          </View>
          {classes.map(c => (
            <View key={c.id} style={styles.headCell}>
              <Text style={{ fontSize }}>{classLabel(c)}</Text>
            </View>
          ))}
        </View>

        {subjects.map(subject => (
          <View key={subject.id} style={styles.row}>
            <View style={[styles.dataCell, styles.dataSubject]}>
              <Text style={{ fontSize: fontSize }}>{subject.name}</Text>
            </View>
            {classes.map(c => {
              const req = reqByClassSubject.get(`${c.id}:${subject.id}`)
              const teacherId = teacherByClassSubject.get(`${c.id}:${subject.id}`)
              const teacher = teacherId ? teacherById.get(teacherId) : undefined
              const taught = Boolean(req && req.weeklyPeriods > 0 && teacher)
              return (
                <View key={c.id} style={[styles.dataCell, { minHeight: rowHeight }]}>
                  <Text style={taught ? [styles.teacherLabel, { fontSize: Math.max(6.6, fontSize - 1) }] : styles.unavailable}>{taught ? teacher?.name : 'X'}</Text>
                </View>
              )
            })}
          </View>
        ))}
      </View>

      <Text style={{ marginTop: 6, fontSize: 6.5, textAlign: 'right' }}>
        Academic Year: {data.school.academicYear || '—'}
      </Text>
    </Page>
  )
}

function WeeklyPdf({ data, entries, title, filterClassId, filterTeacherId }: Props) {
  const days = data.settings.workingDays
  const rows = Array.from({ length: data.settings.periodsPerDay }, (_, i) => i + 1)
  const filtered = entries.filter(e => (!filterClassId || e.classId === filterClassId) && (!filterTeacherId || e.teacherId === filterTeacherId))
  const get = (day: string, period: number) => filtered.find(e => e.day === day && e.period === period)

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.logoBox}>{data.school.logoUrl ? <Image src={data.school.logoUrl} style={styles.logo} /> : null}</View>
        <View style={styles.headerText}>
          <Text style={[styles.schoolName, { fontSize: data.school.name.length > 24 ? 29 : 35 }]}>{data.school.name}</Text>
          <Text style={styles.campus}>({data.school.campusName || 'Main Campus'})</Text>
        </View>
        <View style={{ width: 78 }} />
      </View>
      <View style={styles.topRule} />
      <View style={styles.secondRule} />
      <Text style={styles.weeklyTitle}>{title || 'Timetable'}</Text>
      <Text style={styles.weeklyMeta}>{data.school.academicYear} · {data.school.address}</Text>
      <View style={styles.weeklyTable}>
        <View style={[styles.weeklyRow, styles.weeklyHead]}>
          <View style={[styles.weeklyCell, styles.weeklyPeriod]}><Text style={styles.weeklyBodyText}>Period</Text></View>
          {days.map(d => <View key={d} style={styles.weeklyCell}><Text style={styles.weeklyBodyText}>{d}</Text></View>)}
        </View>
        {rows.map(p => (
          <View key={p} style={styles.weeklyRow}>
            <View style={[styles.weeklyCell, styles.weeklyPeriod]}><Text style={styles.weeklyBodyText}>{p}</Text></View>
            {days.map(day => {
              const e = get(day, p)
              const s = e && data.subjects.find(x => x.id === e.subjectId)
              const t = e && data.teachers.find(x => x.id === e.teacherId)
              return <View key={day} style={styles.weeklyCell}><Text style={styles.weeklyBodyText}>{s?.shortName || s?.name || 'Free'}</Text>{t && <Text style={styles.weeklySmall}>{t.name}</Text>}</View>
            })}
          </View>
        ))}
      </View>
    </Page>
  )
}

export function TimetablePdf(props: Props) {
  return (
    <Document>
      {props.referenceMatrix ? <ReferenceMatrix data={props.data} /> : <WeeklyPdf {...props} />}
    </Document>
  )
}
