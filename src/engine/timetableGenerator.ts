import type { Dataset, GenerationProblem, GenerationResult, TimetableEntry } from '@/types'
import type { EngineInput } from './types'
import { validateConfiguration, validateEntries } from './validator'
import { scoreSchedule } from './scoring'

type Task = {
  id: string
  classId: string
  subjectId: string
  teacherId: string
  priority: number
  ordinal: number
}

type Edge = {
  id: string
  left: number
  right: number
  classId: string
  subjectId: string
  teacherId: string
  priority: number
  real: boolean
}

type SearchState = {
  entries: TimetableEntry[]
  classBusy: Set<string>
  teacherBusy: Set<string>
  teacherLoad: Map<string, number>
  subjectDay: Map<string, number>
}

const slotKey = (day: string, period: number) => `${day}|${period}`
const classSlotKey = (classId: string, day: string, period: number) => `${classId}|${day}|${period}`
const teacherSlotKey = (teacherId: string, day: string, period: number) => `${teacherId}|${day}|${period}`
const requirementKey = (classId: string, subjectId: string) => `${classId}|${subjectId}`
const subjectDayKey = (classId: string, subjectId: string, day: string) => `${classId}|${subjectId}|${day}`

function buildTaskList(input: EngineInput, data: Dataset): { tasks: Task[]; problems: GenerationProblem[] } {
  const problems: GenerationProblem[] = []
  const assignments = new Map(input.assignments.map(a => [requirementKey(a.classId, a.subjectId), a]))
  const tasks: Task[] = []

  for (const req of input.requirements.filter(r => input.classes.includes(r.classId) && r.weeklyPeriods > 0)) {
    const assignment = assignments.get(requirementKey(req.classId, req.subjectId))
    if (!assignment) {
      problems.push({ code: 'MISSING_TEACHER', message: `Class ${req.classId}, subject ${req.subjectId} has no configured teacher assignment.` })
      continue
    }
    const teacher = data.teachers.find(t => t.id === assignment.teacherId && t.active)
    if (!teacher) {
      problems.push({ code: 'TEACHER_INACTIVE', message: `The teacher assigned to class ${req.classId}, subject ${req.subjectId} is missing or inactive.` })
      continue
    }
    for (let ordinal = 0; ordinal < req.weeklyPeriods; ordinal++) {
      tasks.push({ id: `${req.classId}|${req.subjectId}|${ordinal}`, classId: req.classId, subjectId: req.subjectId, teacherId: assignment.teacherId, priority: req.priority, ordinal })
    }
  }
  return { tasks, problems }
}

function perfectMatching(leftCount: number, rightCount: number, edges: Map<string, number>): number[][] | null {
  const matchRight = new Array(rightCount).fill(-1)
  const adjacency: number[][] = Array.from({ length: leftCount }, () => [])
  for (const [key, count] of edges) {
    if (count <= 0) continue
    const [left, right] = key.split('|').map(Number)
    adjacency[left].push(right)
  }
  for (const list of adjacency) list.sort((a, b) => a - b)

  const dfs = (left: number, seen: Set<number>): boolean => {
    for (const right of adjacency[left]) {
      if (seen.has(right)) continue
      seen.add(right)
      if (matchRight[right] === -1 || dfs(matchRight[right], seen)) {
        matchRight[right] = left
        return true
      }
    }
    return false
  }

  for (let left = 0; left < leftCount; left++) {
    if (!dfs(left, new Set())) return null
  }
  const matching: number[][] = []
  for (let right = 0; right < rightCount; right++) {
    if (matchRight[right] >= 0) matching.push([matchRight[right], right])
  }
  return matching.length === leftCount ? matching : null
}

function edgeColorGlobal(tasks: Task[], input: EngineInput): TimetableEntry[] | null {
  const degree = input.days.length * input.periodsPerDay
  const realTaskByKey = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = requirementKey(task.classId, task.subjectId)
    const list = realTaskByKey.get(key) ?? []
    list.push(task)
    realTaskByKey.set(key, list)
  }

  type ColoredEdge = {
    id: string
    classId: string
    teacherId: string
    subjectId: string
    priority: number
    color: number | null
    generated: boolean
    fixedEntryId?: string
    fixedLocked?: boolean
  }

  const edges: ColoredEdge[] = []
  const lockedTaskIds = new Set<string>()
  const fixedEntries = input.lockedEntries

  // Fixed entries from other classes (for selected-class regeneration) occupy graph colors too.
  // They are included as precolored edges without consuming any generated task.
  for (const entry of fixedEntries) {
    let taskId = ''
    const candidates = realTaskByKey.get(requirementKey(entry.classId, entry.subjectId)) ?? []
    const match = candidates.find(t => !lockedTaskIds.has(t.id) && t.teacherId === entry.teacherId)
    if (match) {
      lockedTaskIds.add(match.id)
      taskId = match.id
    }
    // A fixed entry is always represented as a fixed edge. When it matches a generated task,
    // that task is simply consumed so the requirement cannot be scheduled twice.
    const color = input.days.indexOf(entry.day) * input.periodsPerDay + (entry.period - 1)
    if (color < 0 || color >= degree || !entry.day) return null
    edges.push({ id: taskId ? `fixed-task-${taskId}` : `fixed-${entry.id}`, classId: entry.classId, teacherId: entry.teacherId, subjectId: entry.subjectId, priority: 0, color, generated: false, fixedEntryId: entry.id, fixedLocked: Boolean(entry.locked) })
  }

  for (const task of tasks) {
    if (lockedTaskIds.has(task.id)) continue
    edges.push({ id: task.id, classId: task.classId, teacherId: task.teacherId, subjectId: task.subjectId, priority: task.priority, color: null, generated: true })
  }

  const classIds = [...new Set(edges.map(e => e.classId))]
  const teacherIds = [...new Set(edges.map(e => e.teacherId))]
  const classEdges = new Map<string, ColoredEdge[]>()
  const teacherEdges = new Map<string, ColoredEdge[]>()
  for (const edge of edges) {
    const cl = classEdges.get(edge.classId) ?? []
    cl.push(edge)
    classEdges.set(edge.classId, cl)
    const tl = teacherEdges.get(edge.teacherId) ?? []
    tl.push(edge)
    teacherEdges.set(edge.teacherId, tl)
  }

  if (classIds.some(id => (classEdges.get(id)?.length ?? 0) > degree)) return null
  if (teacherIds.some(id => (teacherEdges.get(id)?.length ?? 0) > degree)) return null

  // Verify precolored edges are already a proper partial edge-coloring.
  const usedAtClass = new Map<string, Set<number>>()
  const usedAtTeacher = new Map<string, Set<number>>()
  for (const edge of edges.filter(e => e.color != null)) {
    const cs = usedAtClass.get(edge.classId) ?? new Set<number>()
    if (cs.has(edge.color!)) return null
    cs.add(edge.color!)
    usedAtClass.set(edge.classId, cs)
    const ts = usedAtTeacher.get(edge.teacherId) ?? new Set<number>()
    if (ts.has(edge.color!)) return null
    ts.add(edge.color!)
    usedAtTeacher.set(edge.teacherId, ts)
  }

  const incident = (vertexType: 'class' | 'teacher', id: string) => vertexType === 'class' ? classEdges.get(id) ?? [] : teacherEdges.get(id) ?? []
  const usedColors = (vertexType: 'class' | 'teacher', id: string) => new Set(incident(vertexType, id).filter(e => e.color != null).map(e => e.color!))
  const missingColors = (vertexType: 'class' | 'teacher', id: string) => {
    const used = usedColors(vertexType, id)
    const out: number[] = []
    for (let c = 0; c < degree; c++) if (!used.has(c)) out.push(c)
    return out
  }

  const adjacentVertex = (edge: ColoredEdge, vertexType: 'class' | 'teacher') => vertexType === 'class' ? `teacher|${edge.teacherId}` : `class|${edge.classId}`
  const vertexEdgesForColor = (vertex: string, color: number) => {
    const [kind, id] = vertex.split('|') as ['class' | 'teacher', string]
    return incident(kind, id).filter(e => e.color === color)
  }

  const swapComponent = (startVertex: string, colorA: number, colorB: number) => {
    const queue = [startVertex]
    const seenVertices = new Set<string>(queue)
    const componentEdges = new Set<ColoredEdge>()
    while (queue.length) {
      const vertex = queue.shift()!
      const kind = vertex.startsWith('class|') ? 'class' : 'teacher'
      const id = vertex.split('|')[1]
      for (const edge of incident(kind, id).filter(e => e.color === colorA || e.color === colorB)) {
        componentEdges.add(edge)
        const next = adjacentVertex(edge, kind as 'class' | 'teacher')
        if (!seenVertices.has(next)) { seenVertices.add(next); queue.push(next) }
      }
    }
    for (const edge of componentEdges) {
      if (edge.color === colorA) edge.color = colorB
      else if (edge.color === colorB) edge.color = colorA
    }
  }

  // Color uncolored edges one by one. Because this is bipartite, a proper partial
  // Δ-edge-coloring can be extended to Δ colors by the alternating-path recoloring step below.
  const uncolored = () => edges.filter(e => e.color == null).sort((a, b) => {
    const am = Math.min(missingColors('class', a.classId).length, missingColors('teacher', a.teacherId).length)
    const bm = Math.min(missingColors('class', b.classId).length, missingColors('teacher', b.teacherId).length)
    return am - bm || b.priority - a.priority || a.id.localeCompare(b.id)
  })

  while (true) {
    const pending = uncolored()
    if (!pending.length) break
    const edge = pending[0]
    let classMissing = missingColors('class', edge.classId)
    let teacherMissing = missingColors('teacher', edge.teacherId)
    if (!classMissing.length || !teacherMissing.length) return null

    const common = classMissing.find(c => teacherMissing.includes(c))
    if (common != null) {
      edge.color = common
      continue
    }

    let colored = false
    for (const alpha of classMissing) {
      for (const beta of teacherMissing) {
        // The alpha/beta component starting at the class endpoint cannot contain the
        // teacher endpoint when the teacher endpoint is missing beta. If it did, its
        // alternating path would end with beta at the teacher, contradicting missing beta.
        const component = new Set<string>()
        const queue = [`class|${edge.classId}`]
        component.add(queue[0])
        while (queue.length) {
          const vertex = queue.shift()!
          const kind = vertex.startsWith('class|') ? 'class' : 'teacher'
          for (const e of incident(kind as 'class' | 'teacher', vertex.split('|')[1]).filter(e => e.color === alpha || e.color === beta)) {
            const next = adjacentVertex(e, kind as 'class' | 'teacher')
            if (!component.has(next)) { component.add(next); queue.push(next) }
          }
        }
        const teacherVertex = `teacher|${edge.teacherId}`
        if (!component.has(teacherVertex)) {
          swapComponent(`class|${edge.classId}`, alpha, beta)
          edge.color = beta
          colored = true
          break
        }
      }
      if (colored) break
    }
    if (!colored) return null
  }

  return edges.map(edge => {
    const color = edge.color!
    return { id: crypto.randomUUID(), timetableId: input.timetableId, classId: edge.classId, subjectId: edge.subjectId, teacherId: edge.teacherId, day: input.days[Math.floor(color / input.periodsPerDay)], period: (color % input.periodsPerDay) + 1, locked: edge.fixedEntryId ? Boolean(edge.fixedLocked) : false }
  })
}


type RegularizedEdge = {
  id: string
  leftId: string
  rightId: string
  task?: Task
  forcedSlot?: number
  fixedLocked?: boolean
}

/**
 * Schedules the class/teacher multigraph as a sequence of perfect matchings.
 *
 * Every configured class has exactly `days * periodsPerDay` lesson edges (validated
 * before this function runs). We add dummy vertices/edges until both sides become
 * a balanced Δ-regular bipartite multigraph. Removing one perfect matching per
 * timetable slot preserves regularity, while explicit teacher unavailability and
 * preserved cells are treated as hard eligibility constraints.
 *
 * This avoids the exponential slot-by-slot lesson search that previously became
 * unusably slow as soon as even one availability rule was configured.
 */
function generateByRegularizedMatching(tasks: Task[], input: EngineInput, data: Dataset): TimetableEntry[] | null {
  const degree = input.days.length * input.periodsPerDay
  if (degree <= 0) return null

  const realLeft = [...input.classes]
  const realRight = data.teachers.filter(t => t.active).map(t => t.id)
  const n = Math.max(realLeft.length, realRight.length)
  if (n === 0) return []

  const leftIds = [...realLeft]
  const rightIds = [...realRight]
  while (leftIds.length < n) leftIds.push(`__dummy_class_${leftIds.length}`)
  while (rightIds.length < n) rightIds.push(`__dummy_teacher_${rightIds.length}`)

  const slotOf = (entry: TimetableEntry) => input.days.indexOf(entry.day) * input.periodsPerDay + (entry.period - 1)
  const unavailable = new Set(input.availability.filter(a => a.available === false).map(a => teacherSlotKey(a.teacherId, a.day, a.period)))

  // Bind each preserved cell to one concrete lesson task. Parallel lessons are
  // intentionally separate tasks, so multiple locked periods of the same subject
  // can be fixed to different slots without ambiguity.
  const tasksByLesson = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = `${task.classId}|${task.subjectId}|${task.teacherId}`
    const list = tasksByLesson.get(key) ?? []
    list.push(task)
    tasksByLesson.set(key, list)
  }
  const forcedByTask = new Map<string, { slot: number; locked: boolean }>()
  for (const entry of input.lockedEntries) {
    const slot = slotOf(entry)
    if (slot < 0 || slot >= degree) return null
    const key = `${entry.classId}|${entry.subjectId}|${entry.teacherId}`
    const task = (tasksByLesson.get(key) ?? []).find(t => !forcedByTask.has(t.id))
    if (!task) return null
    forcedByTask.set(task.id, { slot, locked: Boolean(entry.locked) })
  }

  const baseEdges: RegularizedEdge[] = tasks.map(task => {
    const fixed = forcedByTask.get(task.id)
    return {
      id: `real:${task.id}`,
      leftId: task.classId,
      rightId: task.teacherId,
      task,
      forcedSlot: fixed?.slot,
      fixedLocked: fixed?.locked,
    }
  })

  const leftDegree = new Map(leftIds.map(id => [id, 0]))
  const rightDegree = new Map(rightIds.map(id => [id, 0]))
  for (const edge of baseEdges) {
    leftDegree.set(edge.leftId, (leftDegree.get(edge.leftId) ?? 0) + 1)
    rightDegree.set(edge.rightId, (rightDegree.get(edge.rightId) ?? 0) + 1)
  }
  if ([...leftDegree.values()].some(v => v > degree) || [...rightDegree.values()].some(v => v > degree)) return null

  const leftDeficits: string[] = []
  const rightDeficits: string[] = []
  for (const id of leftIds) for (let i = leftDegree.get(id) ?? 0; i < degree; i++) leftDeficits.push(id)
  for (const id of rightIds) for (let i = rightDegree.get(id) ?? 0; i < degree; i++) rightDeficits.push(id)
  if (leftDeficits.length !== rightDeficits.length) return null
  for (let i = 0; i < leftDeficits.length; i++) {
    baseEdges.push({ id: `dummy:${i}`, leftId: leftDeficits[i], rightId: rightDeficits[i] })
  }

  const slotInfo = Array.from({ length: degree }, (_, slot) => ({
    slot,
    day: input.days[Math.floor(slot / input.periodsPerDay)],
    period: (slot % input.periodsPerDay) + 1,
  }))
  const forcedCount = new Map<number, number>()
  for (const edge of baseEdges) if (edge.forcedSlot != null) forcedCount.set(edge.forcedSlot, (forcedCount.get(edge.forcedSlot) ?? 0) + 1)
  const blockedCount = new Map<number, number>()
  for (const info of slotInfo) {
    let blocked = 0
    for (const task of tasks) if (unavailable.has(teacherSlotKey(task.teacherId, info.day, info.period))) blocked++
    blockedCount.set(info.slot, blocked)
  }
  const orderedSlots = [...slotInfo].sort((a, b) =>
    (forcedCount.get(b.slot) ?? 0) - (forcedCount.get(a.slot) ?? 0) ||
    (blockedCount.get(b.slot) ?? 0) - (blockedCount.get(a.slot) ?? 0) ||
    a.slot - b.slot
  )

  const rank = (value: string, attempt: number, slot: number) => {
    let h = (2166136261 ^ (attempt * 16777619) ^ slot) >>> 0
    for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0
    return h
  }

  const maxAttempts = input.availability.length || input.lockedEntries.length ? 96 : 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let remaining = [...baseEdges]
    const scheduled: TimetableEntry[] = []
    let failed = false

    for (const info of orderedSlots) {
      const forced = remaining.filter(e => e.forcedSlot === info.slot)
      const forcedLeft = new Set<string>()
      const forcedRight = new Set<string>()
      for (const edge of forced) {
        if (forcedLeft.has(edge.leftId) || forcedRight.has(edge.rightId)) { failed = true; break }
        if (edge.task && unavailable.has(teacherSlotKey(edge.task.teacherId, info.day, info.period))) { failed = true; break }
        forcedLeft.add(edge.leftId)
        forcedRight.add(edge.rightId)
      }
      if (failed) break

      const eligible = (edge: RegularizedEdge) => {
        if (edge.forcedSlot != null && edge.forcedSlot !== info.slot) return false
        if (!edge.task) return true
        return !unavailable.has(teacherSlotKey(edge.task.teacherId, info.day, info.period))
      }

      const rightsForLeft = new Map<string, string[]>()
      for (const leftId of leftIds) {
        if (forcedLeft.has(leftId)) continue
        const rights = [...new Set(remaining.filter(e => e.leftId === leftId && eligible(e) && !forcedRight.has(e.rightId)).map(e => e.rightId))]
        rights.sort((a, b) => rank(`${leftId}|${a}`, attempt, info.slot) - rank(`${leftId}|${b}`, attempt, info.slot))
        rightsForLeft.set(leftId, rights)
      }

      const matchRight = new Map<string, string>()
      for (const edge of forced) matchRight.set(edge.rightId, edge.leftId)
      const visit = (leftId: string, seen: Set<string>): boolean => {
        for (const rightId of rightsForLeft.get(leftId) ?? []) {
          if (seen.has(rightId) || forcedRight.has(rightId)) continue
          seen.add(rightId)
          const previous = matchRight.get(rightId)
          if (previous == null || (!forcedLeft.has(previous) && visit(previous, seen))) {
            matchRight.set(rightId, leftId)
            return true
          }
        }
        return false
      }

      const unmatchedLeft = leftIds.filter(id => !forcedLeft.has(id)).sort((a, b) =>
        (rightsForLeft.get(a)?.length ?? 0) - (rightsForLeft.get(b)?.length ?? 0) || rank(a, attempt, info.slot) - rank(b, attempt, info.slot)
      )
      for (const leftId of unmatchedLeft) {
        if (!visit(leftId, new Set())) { failed = true; break }
      }
      if (failed || matchRight.size !== n) { failed = true; break }

      const pairToForced = new Map(forced.map(e => [`${e.leftId}|${e.rightId}`, e]))
      const chosen: RegularizedEdge[] = []
      for (const [rightId, leftId] of matchRight) {
        const pair = `${leftId}|${rightId}`
        const forcedEdge = pairToForced.get(pair)
        if (forcedEdge) { chosen.push(forcedEdge); continue }
        const candidates = remaining.filter(e => e.leftId === leftId && e.rightId === rightId && eligible(e))
        if (!candidates.length) { failed = true; break }
        candidates.sort((a, b) => {
          if (!a.task && b.task) return 1
          if (a.task && !b.task) return -1
          if (!a.task || !b.task) return rank(a.id, attempt, info.slot) - rank(b.id, attempt, info.slot)
          const sameDayA = scheduled.filter(x => x.classId === a.task!.classId && x.subjectId === a.task!.subjectId && x.day === info.day).length
          const sameDayB = scheduled.filter(x => x.classId === b.task!.classId && x.subjectId === b.task!.subjectId && x.day === info.day).length
          const nearbyA = scheduled.some(x => x.classId === a.task!.classId && x.subjectId === a.task!.subjectId && x.day === info.day && Math.abs(x.period - info.period) === 1) ? 1 : 0
          const nearbyB = scheduled.some(x => x.classId === b.task!.classId && x.subjectId === b.task!.subjectId && x.day === info.day && Math.abs(x.period - info.period) === 1) ? 1 : 0
          const scoreA = sameDayA * 40 + nearbyA * 25 - (a.task.priority >= 3 && info.period <= 4 ? 10 : 0)
          const scoreB = sameDayB * 40 + nearbyB * 25 - (b.task.priority >= 3 && info.period <= 4 ? 10 : 0)
          return scoreA - scoreB || rank(a.id, attempt, info.slot) - rank(b.id, attempt, info.slot)
        })
        chosen.push(candidates[0])
      }
      if (failed || chosen.length !== n) { failed = true; break }

      const chosenIds = new Set(chosen.map(e => e.id))
      remaining = remaining.filter(e => !chosenIds.has(e.id))
      for (const edge of chosen) {
        if (!edge.task) continue
        scheduled.push({
          id: crypto.randomUUID(),
          timetableId: input.timetableId,
          classId: edge.task.classId,
          subjectId: edge.task.subjectId,
          teacherId: edge.task.teacherId,
          day: info.day,
          period: info.period,
          locked: edge.forcedSlot != null ? Boolean(edge.fixedLocked) : false,
        })
      }
    }

    if (!failed && remaining.length === 0 && scheduled.length === tasks.length) return scheduled
  }

  return null
}

function candidateScore(task: Task, day: string, period: number, state: SearchState, byClass: Map<string, TimetableEntry[]>, targetByTeacher: Map<string, number>): number {
  let score = 0
  score += (state.subjectDay.get(subjectDayKey(task.classId, task.subjectId, day)) ?? 0) * 40
  const classEntries = byClass.get(task.classId) ?? []
  if (classEntries.some(e => e.day === day && (e.period === period - 1 || e.period === period + 1) && e.subjectId === task.subjectId)) score += 25
  if (task.priority >= 3 && period <= 4) score -= 12
  const nextLoad = (state.teacherLoad.get(task.teacherId) ?? 0) + 1
  score += Math.abs(nextLoad - (targetByTeacher.get(task.teacherId) ?? 0)) * 3
  return score
}

function generateBySlotMatching(tasks: Task[], input: EngineInput, data: Dataset): TimetableEntry[] | null {
  const days = input.days
  const periods = input.periodsPerDay
  const slots = days.flatMap(day => Array.from({ length: periods }, (_, i) => ({ day, period: i + 1 })))
  const classIds = input.classes
  const teachers = new Map(input.teachers.map(t => [t.id, t]))
  const assignmentQueues = new Map<string, Task[]>()
  const remaining = new Map<string, number>()

  for (const task of tasks) {
    const key = requirementKey(task.classId, task.subjectId)
    const queue = assignmentQueues.get(key) ?? []
    queue.push(task)
    assignmentQueues.set(key, queue)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }

  // Consume locked entries first. This preserves them and prevents regeneration from
  // duplicating their subject requirement.
  for (const entry of input.lockedEntries) {
    if (!classIds.includes(entry.classId)) continue
    const key = requirementKey(entry.classId, entry.subjectId)
    const queue = assignmentQueues.get(key)
    const idx = queue?.findIndex(t => t.teacherId === entry.teacherId)
    if (!queue || idx == null || idx < 0 || (remaining.get(key) ?? 0) <= 0) return null
    queue.splice(idx, 1)
    remaining.set(key, remaining.get(key)! - 1)
  }

  const unavailable = new Set(input.availability.filter(a => a.available === false).map(a => teacherSlotKey(a.teacherId, a.day, a.period)))
  const entries: TimetableEntry[] = [...input.lockedEntries]
  const classBusy = new Set(input.lockedEntries.map(e => classSlotKey(e.classId, e.day, e.period)))
  const teacherBusy = new Set(input.lockedEntries.map(e => teacherSlotKey(e.teacherId, e.day, e.period)))
  const subjectDay = new Map<string, number>()
  for (const e of input.lockedEntries) subjectDay.set(subjectDayKey(e.classId, e.subjectId, e.day), (subjectDay.get(subjectDayKey(e.classId, e.subjectId, e.day)) ?? 0) + 1)

  // Remaining lesson pairs are the edges of the global bipartite graph.
  const pairQueue = new Map<string, Task[]>()
  for (const [key, queue] of assignmentQueues) {
    for (const task of queue) {
      const pair = `${task.classId}|${task.teacherId}`
      const list = pairQueue.get(pair) ?? []
      list.push(task)
      pairQueue.set(pair, list)
    }
    void key
  }

  const classForSlot = (classId: string, day: string, period: number) => classSlotKey(classId, day, period)
  const teacherForSlot = (teacherId: string, day: string, period: number) => teacherSlotKey(teacherId, day, period)
  let nodes = 0
  const nodeLimit = Math.max(100_000, tasks.length * slots.length * 8)

  const taskScore = (task: Task, day: string, period: number) => {
    let score = 0
    score += (subjectDay.get(subjectDayKey(task.classId, task.subjectId, day)) ?? 0) * 45
    if (task.priority >= 3 && period <= 4) score -= 10
    const sameClassSubjectNearby = entries.some(e => e.classId === task.classId && e.day === day && Math.abs(e.period - period) === 1 && e.subjectId === task.subjectId)
    if (sameClassSubjectNearby) score += 25
    return score
  }

  const solve = (slotIndex: number): boolean => {
    if (remainingTotal() === 0) return true
    if (slotIndex >= slots.length) return false
    nodes++
    if (nodes > nodeLimit) return false

    const { day, period } = slots[slotIndex]
    const needsClass = classIds.filter(c => !classBusy.has(classForSlot(c, day, period)))
    const matchedTeachers = new Set<string>()
    const chosen: { classId: string; teacherId: string; task: Task }[] = []

    const availablePairsForClass = (classId: string) => {
      const options: { teacherId: string; tasks: Task[] }[] = []
      for (const [pair, queue] of pairQueue) {
        if (!queue.length) continue
        const [pairClass, teacherId] = pair.split('|')
        if (pairClass !== classId || matchedTeachers.has(teacherId)) continue
        const teacher = teachers.get(teacherId)
        if (!teacher) continue
        const tk = teacherForSlot(teacherId, day, period)
        if (teacherBusy.has(tk)) continue
        if (unavailable.has(tk)) continue
        if ((data.teachers.find(t => t.id === teacherId)?.maxWeeklyPeriods ?? 0) <= 0) continue
        options.push({ teacherId, tasks: queue })
      }
      return options
    }

    const assignmentOrder = [...needsClass].sort((a, b) => {
      const aa = availablePairsForClass(a).length
      const bb = availablePairsForClass(b).length
      return aa - bb || a.localeCompare(b)
    })

    const assignMatching = (index: number): boolean => {
      if (index === assignmentOrder.length) {
        if (solve(slotIndex + 1)) return true
        // Roll back this slot if the future cannot be solved.
        for (const pick of chosen) {
          const pair = `${pick.classId}|${pick.teacherId}`
          const queue = pairQueue.get(pair)!
          queue.push(pick.task)
          queue.sort((a, b) => taskScore(a, day, period) - taskScore(b, day, period) || a.ordinal - b.ordinal)
          const key = requirementKey(pick.task.classId, pick.task.subjectId)
          remaining.set(key, remaining.get(key)! + 1)
        }
        for (const pick of chosen) {
          const ck = classForSlot(pick.classId, day, period)
          const tk = teacherForSlot(pick.teacherId, day, period)
          classBusy.delete(ck)
          teacherBusy.delete(tk)
          const entryIndex = entries.findIndex(e => e.classId === pick.classId && e.day === day && e.period === period && e.teacherId === pick.teacherId)
          if (entryIndex >= 0) entries.splice(entryIndex, 1)
          const sdk = subjectDayKey(pick.classId, pick.task.subjectId, day)
          const count = (subjectDay.get(sdk) ?? 1) - 1
          if (count <= 0) { subjectDay.delete(sdk) } else { subjectDay.set(sdk, count) }
        }
        return false
      }

      const classId = assignmentOrder[index]
      const options = availablePairsForClass(classId).sort((a, b) => {
        const sa = Math.min(...a.tasks.map(t => taskScore(t, day, period)))
        const sb = Math.min(...b.tasks.map(t => taskScore(t, day, period)))
        return sa - sb || a.teacherId.localeCompare(b.teacherId)
      })

      for (const option of options) {
        const task = [...option.tasks].sort((a, b) => taskScore(a, day, period) - taskScore(b, day, period) || a.ordinal - b.ordinal)[0]
        const key = requirementKey(task.classId, task.subjectId)
        const tk = teacherForSlot(option.teacherId, day, period)
        const ck = classForSlot(classId, day, period)
        if (matchedTeachers.has(option.teacherId) || teacherBusy.has(tk) || classBusy.has(ck)) continue
        matchedTeachers.add(option.teacherId)
        classBusy.add(ck)
        teacherBusy.add(tk)
        remaining.set(key, remaining.get(key)! - 1)
        option.tasks.splice(option.tasks.indexOf(task), 1)
        const entry: TimetableEntry = { id: crypto.randomUUID(), timetableId: input.timetableId, classId, subjectId: task.subjectId, teacherId: option.teacherId, day, period, locked: false }
        entries.push(entry)
        chosen.push({ classId, teacherId: option.teacherId, task })
        subjectDay.set(subjectDayKey(classId, task.subjectId, day), (subjectDay.get(subjectDayKey(classId, task.subjectId, day)) ?? 0) + 1)

        if (assignMatching(index + 1)) return true

        chosen.pop()
        const currentQueue = pairQueue.get(`${classId}|${option.teacherId}`)!
        currentQueue.push(task)
        currentQueue.sort((a, b) => taskScore(a, day, period) - taskScore(b, day, period) || a.ordinal - b.ordinal)
        remaining.set(key, remaining.get(key)! + 1)
        const entryIndex = entries.findIndex(e => e.id === entry.id)
        if (entryIndex >= 0) entries.splice(entryIndex, 1)
        const sdk = subjectDayKey(classId, task.subjectId, day)
        const dc = (subjectDay.get(sdk) ?? 1) - 1
        if (dc <= 0) { subjectDay.delete(sdk) } else { subjectDay.set(sdk, dc) }
        classBusy.delete(ck)
        teacherBusy.delete(tk)
        matchedTeachers.delete(option.teacherId)
      }
      return false
    }

    if (assignmentOrder.length === 0) return solve(slotIndex + 1)
    const success = assignMatching(0)
    if (!success && chosen.length) {
      for (const pick of [...chosen].reverse()) {
        const pair = `${pick.classId}|${pick.teacherId}`
        const queue = pairQueue.get(pair)!
        if (!queue.some(t => t.id === pick.task.id)) queue.push(pick.task)
      }
    }
    return success
  }

  const remainingTotal = () => [...remaining.values()].reduce((sum, value) => sum + value, 0)
  return solve(0) ? entries : null
}

export function generateTimetable(input: EngineInput, data: Dataset): GenerationResult {
  // CRITICAL: the engine always schedules every active class together. input.classes is intentionally ignored.

  const configValidation = validateConfiguration(data)
  if (!configValidation.valid) return { success: false, entries: input.lockedEntries, problems: configValidation.errors, warnings: configValidation.warnings, score: 0 }

  const requestedClassIds = data.classes.filter(c => c.active).map(c => c.id)
  const globalInput: EngineInput = {
    ...input,
    classes: requestedClassIds,
    requirements: data.classSubjects.filter(r => requestedClassIds.includes(r.classId)),
  }

  // Reject contradictory locked cells before any search starts.
  const lockedClassSlots = new Set<string>()
  const lockedTeacherSlots = new Set<string>()
  for (const entry of globalInput.lockedEntries) {
    const ck = classSlotKey(entry.classId, entry.day, entry.period)
    const tk = teacherSlotKey(entry.teacherId, entry.day, entry.period)
    if (lockedClassSlots.has(ck)) {
      return { success: false, entries: globalInput.lockedEntries, problems: [{ code: 'LOCKED_CLASS_CONFLICT', message: `Impossible timetable: the locked cells contain two entries for class ${entry.classId} at ${entry.day} Period ${entry.period}.` }], warnings: configValidation.warnings, score: 0 }
    }
    if (lockedTeacherSlots.has(tk)) {
      const teacher = data.teachers.find(t => t.id === entry.teacherId)
      return { success: false, entries: globalInput.lockedEntries, problems: [{ code: 'LOCKED_TEACHER_CONFLICT', message: `Impossible timetable: ${teacher?.name || entry.teacherId} is locked into more than one class at ${entry.day} Period ${entry.period}.` }], warnings: configValidation.warnings, score: 0 }
    }
    const assignment = data.assignments.find(a => a.classId === entry.classId && a.subjectId === entry.subjectId)
    if (!assignment || assignment.teacherId !== entry.teacherId) {
      return { success: false, entries: globalInput.lockedEntries, problems: [{ code: 'LOCKED_WRONG_TEACHER', message: `Locked entry is not consistent with the configured teacher assignment for class ${entry.classId}, subject ${entry.subjectId}.` }], warnings: configValidation.warnings, score: 0 }
    }
    lockedClassSlots.add(ck)
    lockedTeacherSlots.add(tk)
  }

  const { tasks, problems } = buildTaskList(globalInput, data)
  if (problems.length) return { success: false, entries: globalInput.lockedEntries, problems, warnings: configValidation.warnings, score: 0 }

  const generated = generateByRegularizedMatching(tasks, globalInput, data)

  if (!generated) {
    const demandByTeacher = new Map<string, number>()
    for (const task of tasks) demandByTeacher.set(task.teacherId, (demandByTeacher.get(task.teacherId) ?? 0) + 1)
    const blocked = [...demandByTeacher.entries()].map(([teacherId, demand]) => ({ teacherId, demand, teacher: data.teachers.find(t => t.id === teacherId) })).sort((a, b) => b.demand - a.demand)[0]
    let problem: GenerationProblem = { code: 'NO_SOLUTION', message: 'Impossible timetable: no valid school-wide schedule exists under the current hard constraints.', details: 'No fake timetable is generated. Review locked cells, teacher availability, assignments, or class requirements.' }
    if (blocked?.teacher && blocked.demand > blocked.teacher.maxWeeklyPeriods) {
      problem = { code: 'TEACHER_MAX', message: `Impossible timetable: ${blocked.teacher.name} is assigned to ${blocked.demand} required periods but his/her maximum is ${blocked.teacher.maxWeeklyPeriods}.` }
    }
    return { success: false, entries: globalInput.lockedEntries, problems: [problem], warnings: configValidation.warnings, score: 0 }
  }

  const finalValidation = validateEntries(generated, data)
  if (!finalValidation.valid) return { success: false, entries: globalInput.lockedEntries, problems: finalValidation.errors, warnings: finalValidation.warnings, score: 0 }
  return { success: true, entries: generated, problems: [], warnings: finalValidation.warnings, score: scoreSchedule(generated, data) }
}
