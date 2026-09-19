import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { BarChart3, BookOpen, CalendarDays, CheckCircle2, GraduationCap, LayoutDashboard, Menu, Settings, Users, X } from 'lucide-react'
import type { Dataset, TeacherAssignment, TimetableEntry } from '@/types'
import { attachSchoolId, buildDemoDataset } from '@/data/seed'
import { loadSchoolData, persistMasterData, saveTimetable, syncTimetableEntries } from '@/services/database'
import { getSupabaseStatus, isSupabaseAvailable } from '@/lib/supabase'
import { generateTimetable } from '@/engine/timetableGenerator'
import { validateConfiguration, validateEntries } from '@/engine/validator'
import { Dashboard } from '@/pages/Dashboard'
import { Setup } from '@/pages/Setup'
import { EntityPage } from '@/pages/EntityPage'
import { Assignments } from '@/pages/Assignments'
import { Rules } from '@/pages/Rules'
import { SchoolWideValidationPage } from '@/pages/SchoolWideValidationPage'
import { TimetablePage } from '@/pages/TimetablePage'
import { SettingsPage } from '@/pages/SettingsPage'

interface AppCtx { data:Dataset; setData:React.Dispatch<React.SetStateAction<Dataset>>; generate:(locked?:TimetableEntry[])=>Promise<{success:boolean;message:string;score?:number}>; validation:ReturnType<typeof validateConfiguration>; generating:boolean; setupComplete:boolean }
const Ctx=createContext<AppCtx|null>(null)
export const useApp=()=>{const c=useContext(Ctx);if(!c)throw new Error('App context missing');return c}

function ConnectionBanner(){
 const status=getSupabaseStatus();
 if(status.ok) return null;
 return <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><div className="font-semibold">{status.label}</div><div className="mt-0.5 text-amber-800">{status.detail} {isSupabaseAvailable()?'':'For cloud persistence, fix the Supabase environment variables and restart Vite.'}</div></div>
}

function Shell(){const {data,generate,generating,setupComplete}=useApp();const [mobile,setMobile]=useState(false);const nav=useNavigate(); const links=[['/','Dashboard',LayoutDashboard],['/classes','Classes',GraduationCap],['/teachers','Teachers',Users],['/subjects','Subjects',BookOpen],['/assignments','Assignments',BarChart3],['/rules','Rules',CheckCircle2],['/validation','School-wide Validation',CheckCircle2],['/timetable','Timetable',CalendarDays],['/settings','Settings',Settings]] as const; if(!setupComplete)return <Setup />; return <div className="min-h-screen bg-slate-50 text-slate-900"><aside className={`fixed inset-y-0 left-0 z-40 w-60 border-r border-slate-200 bg-white p-4 transition-transform lg:translate-x-0 ${mobile?'translate-x-0':'-translate-x-full'}`}><div className="flex items-center justify-between px-2 pb-7 pt-2"><div><div className="text-lg font-semibold tracking-tight">Timetable</div><div className="text-xs text-slate-500">{data.school.name}</div></div><button className="lg:hidden" onClick={()=>setMobile(false)}><X size={18}/></button></div><nav className="space-y-1">{links.map(([to,label,Icon])=><NavLink key={to} to={to} onClick={()=>setMobile(false)} className={({isActive})=>`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100'}`}><Icon size={17}/>{label}</NavLink>)}</nav></aside><div className="lg:pl-60"><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6"><button className="lg:hidden" onClick={()=>setMobile(true)}><Menu size={20}/></button><div className="hidden text-sm text-slate-500 sm:block">{data.school.campusName || 'Main campus'} · {data.school.academicYear}</div><button onClick={async()=>{const r=await generate(data.entries.filter(e=>e.locked)); alert(r.message); if(r.success)nav('/timetable')}} disabled={generating} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{generating?'Generating...':'Generate Timetable'}</button></header><main className="p-4 md:p-6"><ConnectionBanner /><Routes><Route path="/" element={<Dashboard/>}/><Route path="/classes" element={<EntityPage kind="classes"/>}/><Route path="/teachers" element={<EntityPage kind="teachers"/>}/><Route path="/subjects" element={<EntityPage kind="subjects"/>}/><Route path="/assignments" element={<Assignments/>}/><Route path="/rules" element={<Rules/>}/><Route path="/validation" element={<SchoolWideValidationPage/>}/><Route path="/timetable" element={<TimetablePage/>}/><Route path="/settings" element={<SettingsPage/>}/></Routes></main></div></div> }

export default function App(){const [data,setData]=useState<Dataset>(buildDemoDataset());const [generating,setGenerating]=useState(false);const [loaded,setLoaded]=useState(false);useEffect(()=>{loadSchoolData().then(async d=>{
 if(d){
   const isPlaceholder=d.school.name==='Your School' && d.classes.length===0 && d.teachers.length===0 && d.subjects.length===0
   if(isPlaceholder){
     const demo=attachSchoolId(buildDemoDataset(), d.school.id)
     const saved=await persistMasterData(demo)
     if(saved.ok){ localStorage.setItem('timetable-configured','1'); setData(demo); return }
   }
   setData(d)
 } else {
   const demo=buildDemoDataset()
   if(isSupabaseAvailable()){
     const cloudSeed=await persistMasterData(demo)
     if(cloudSeed.ok){ localStorage.setItem('timetable-configured','1'); setData(demo); return }
   }
   const raw=localStorage.getItem('timetable-data')
   if(raw) try{setData(JSON.parse(raw))}catch{}
   else setData(demo)
 }
}).finally(()=>setLoaded(true))},[]);
useEffect(()=>{if(!loaded)return;localStorage.setItem('timetable-data',JSON.stringify(data));if(isSupabaseAvailable()){persistMasterData(data).catch(()=>undefined);const latest=data.timetables[data.timetables.length-1];if(latest)syncTimetableEntries(latest.id,data.entries.filter(e=>e.timetableId===latest.id)).catch(()=>undefined)}},[data,loaded]);const validation=useMemo(()=>validateConfiguration(data),[data]);const setupComplete=Boolean(localStorage.getItem('timetable-configured')) || (data.school.name!=='Demo Academy' && data.school.name!=='Your School'); const generate=async(locked:TimetableEntry[]=[])=>{setGenerating(true);try{const targetClassIds=data.classes.filter(c=>c.active).map(c=>c.id);const input={classes:targetClassIds,periodsPerDay:data.settings.periodsPerDay,days:data.settings.workingDays,requirements:data.classSubjects.filter(r=>targetClassIds.includes(r.classId)),assignments:data.assignments,teachers:data.teachers,availability:data.availability,lockedEntries:locked,timetableId:crypto.randomUUID()};const r=generateTimetable(input,data);if(!r.success)return {success:false,message:[r.problems[0]?.message||'Unable to generate timetable.',...(r.problems[0]?.details?[r.problems[0].details]:[])].join(' ')};let saved; try{saved=await saveTimetable(r.entries,data.school.id)}catch(error){return {success:false,message:error instanceof Error?error.message:'Could not save timetable to Supabase.'}} const timetableId=saved.id; setData(d=>({...d,timetables:[...d.timetables,{id:timetableId,schoolId:d.school.id,name:'Generated timetable',status:'generated',createdAt:new Date().toISOString()}],entries:r.entries.map(e=>({...e,timetableId}))}));return {success:true,message:`Timetable generated successfully${saved.localOnly?' (local mode)':''}. Quality score ${r.score}/1000.`,score:r.score}}finally{setGenerating(false)}};if(!loaded)return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading school data...</div>;const Router=window.location.protocol==='file:'?HashRouter:BrowserRouter;return <Ctx.Provider value={{data,setData,generate,validation,generating,setupComplete}}><Router><Shell/></Router></Ctx.Provider>}
