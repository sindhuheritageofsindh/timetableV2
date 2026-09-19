import type { ReactNode } from 'react'
export function EmptyState({title,text,action}:{title:string;text:string;action?:ReactNode}){return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><div className="font-semibold">{title}</div><div className="mt-1 text-sm text-slate-500">{text}</div>{action&&<div className="mt-4">{action}</div>}</div>}
