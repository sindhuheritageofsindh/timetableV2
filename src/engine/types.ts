import type { ClassSubject, Day, Teacher, TeacherAssignment, TeacherAvailability, TimetableEntry } from '@/types'
export interface EngineInput { classes:string[]; periodsPerDay:number; days:Day[]; requirements:ClassSubject[]; assignments:TeacherAssignment[]; teachers:Teacher[]; availability:TeacherAvailability[]; lockedEntries:TimetableEntry[]; timetableId:string }
export interface Candidate { day:string; period:number; score:number }
