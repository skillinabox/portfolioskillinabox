import { createContext, useContext, useState, useCallback } from 'react'

// ── SIB Logo ──────────────────────────────────────────────────
export function SIBLogo({ dark = true }) {
  const textColor = dark ? '#fff' : '#111'
  const tagColor  = dark ? '#555' : '#aaa'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, userSelect:'none' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:3, flexShrink:0 }}>
        <div style={{ width:20, height:3, borderRadius:2, background:'#00B4D8' }}/>
        <div style={{ display:'flex', gap:2, alignItems:'center' }}>
          <div style={{ width:6,  height:3, borderRadius:2, background:'#F4A61A' }}/>
          <div style={{ width:14, height:3, borderRadius:2, background: dark?'#555':'#ccc' }}/>
        </div>
        <div style={{ width:20, height:3, borderRadius:2, background:'#F4622A' }}/>
      </div>
      <div>
        <div style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize:15, color:textColor, lineHeight:1, fontWeight:400, letterSpacing:'.01em' }}>Skillinabox</div>
        <div style={{ fontSize:8, color:tagColor, letterSpacing:'.08em', marginTop:3, textTransform:'uppercase', fontWeight:500 }}>Portfolio Platform</div>
      </div>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────
export function Avatar({ name='', size=32, bg='#2E2E2E', fg='#F4622A' }) {
  const initials = name.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?'
  return <div className="avatar" style={{ width:size, height:size, background:bg, color:fg, fontSize:size*.34 }}>{initials}</div>
}

// ── Status badge ──────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    published:    ['Published',   'b-green'],
    'in-progress':['In progress', 'b-amber'],
    new:          ['Not started', 'b-gray'],
    tagged:       ['Tagged',      'b-green'],
    tagging:      ['LIA tagging…', 'b-purple'],
    uploading:    ['Uploading…',  'b-gray'],
    uploaded:     ['🔒 LIA locked', 'b-amber'],
    ready:        ['Poses ready', 'b-amber'],
    order:        ['Order',       'b-orange'],
    enquiry:      ['Enquiry',     'b-green'],
  }
  const [label, cls] = map[status]||[status,'b-gray']
  return <span className={`badge ${cls}`}>{label}</span>
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size=18, color='var(--orange)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="spin">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="10"/>
    </svg>
  )
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ title, onClose, children, width=460 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:'var(--r-xl)', width:'100%', maxWidth:width, boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeUp .2s ease' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontWeight:600, fontSize:15, color:'var(--dark)' }}>{title}</span>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ fontSize:18 }}>×</button>
        </div>
        <div style={{ padding:20 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────
export function Empty({ icon='○', title, message, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div style={{ fontSize:15, fontWeight:600, color:'var(--dark-3)' }}>{title}</div>
      {message && <p style={{ fontSize:13, color:'var(--mid)', lineHeight:1.6, maxWidth:280 }}>{message}</p>}
      {action}
    </div>
  )
}

// ── Field row ─────────────────────────────────────────────────
export function FieldRow({ label, value, onChange, aiTagged=false, type='text' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
      <span style={{ fontSize:12, color:'var(--mid)', width:88, flexShrink:0 }}>{label}</span>
      <input className="input" type={type} style={{ flex:1, fontSize:13, padding:'5px 9px' }}
        value={value||''} placeholder={label} onChange={e=>onChange(e.target.value)} />
      {aiTagged && <span className="badge b-orange" style={{ flexShrink:0, fontSize:10 }}>LIA</span>}
    </div>
  )
}

// ── Garment thumbnail ─────────────────────────────────────────
const THUMB_COLORS = [
  ['#FEF0EA','#C94E1E'],['#E6F4EC','#0D6B3A'],['#F0EFFE','#5B21B6'],
  ['#FEF3E2','#92400E'],['#EFF6FF','#1D4ED8'],['#F0FDF4','#166534'],
]

export function GarmentThumb({ garment, index=0, selected, onClick }) {
  const [bg, fg] = THUMB_COLORS[index%6]
  return (
    <div onClick={onClick} style={{ border:`${selected?2:1}px solid ${selected?'var(--orange)':'var(--border)'}`, borderRadius:'var(--r-md)', overflow:'hidden', cursor:'pointer', background:'#fff', transition:'border-color .15s', boxShadow: selected?'0 0 0 2px rgba(244,98,42,.15)':'none' }}>
      <div style={{ height:88, background:garment.image_url?`url(${garment.image_url}) center/cover`:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:700, color:fg }}>
        {!garment.image_url&&(garment.name?.[0]||'?')}
      </div>
      <div style={{ padding:'7px 9px' }}>
        <div style={{ fontSize:12, fontWeight:500, color:'var(--dark)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{garment.name||'Processing…'}</div>
        <div style={{ marginTop:3 }}><StatusBadge status={garment.status}/></div>
      </div>
    </div>
  )
}

// ── Toast system ──────────────────────────────────────────────
const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type='default') => {
    const id = Date.now()
    setToasts(p=>[...p,{id,msg,type}])
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)), 3500)
  },[])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts">
        {toasts.map(t=>(
          <div key={t.id} className={`toast t-${t.type}`}>
            {t.type==='success'&&'✓ '}{t.type==='error'&&'✕ '}{t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
