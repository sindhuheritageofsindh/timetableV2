export type Day = string

export interface School {
  id: string
  name: string
  campusName: string
  logoUrl: string
  academicYear: string
  address: string
  createdAt: string
}
export interface ClassRoom { id:string; schoolId:string; name:string; section:string; active:boolean; createdAt:string }
export interface Teacher { id:string; schoolId:string; name:string; employeeId:string; minWeeklyPeriods:number; targetWeeklyPeriods:number; maxWeeklyPeriods:number; active:boolean; createdAt:string }
export interface Subject { id:string; schoolId:string; name:string; shortName:string; active:boolean; createdAt:string }
export interface ClassSubject { id:string; classId:string; subjectId:string; weeklyPeriods:number; priority:number }
export interface TeacherAssignment { id:string; classId:string; subjectId:string; teacherId:string }
export interface TeacherAvailability { id:string; teacherId:string; day:string; period:number; available:boolean }
export interface SchoolSettings { id:string; schoolId:string; workingDays:string[]; periodsPerDay:number; periodDuration:number; breakConfiguration:string }
export interface Timetable { id:string; schoolId:string; name:string; status:'draft'|'generated'|'published'; createdAt:string }
export interface TimetableEntry { id:string; timetableId:string; classId:string; subjectId:string; teacherId:string; day:string; period:number; locked?:boolean }
export interface ConstraintConfig { id:string; schoolId:string; type:string; configuration:Record<string, unknown> }
export interface Dataset {
  school:School; settings:SchoolSettings; classes:ClassRoom[]; teachers:Teacher[]; subjects:Subject[]; classSubjects:ClassSubject[]; assignments:TeacherAssignment[]; availability:TeacherAvailability[]; constraints:ConstraintConfig[]; timetables:Timetable[]; entries:TimetableEntry[]
}

export interface GenerationTask { classId:string; subjectId:string; teacherId:string; ordinal:number; priority:number }
export interface GenerationProblem { code:string; message:string; details?:string }
export interface ValidationResult { valid:boolean; errors:GenerationProblem[]; warnings:string[] }
export interface GenerationResult { success:boolean; entries:TimetableEntry[]; problems:GenerationProblem[]; warnings:string[]; score:number }
