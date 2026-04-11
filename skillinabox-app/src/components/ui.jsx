import { createContext, useContext, useState, useCallback } from 'react'

// ─── Avatar ───────────────────────────────────────────────────
export function Avatar({ name = '', bg = '#F7EEF1', fg = '#8C3F57', size = 32 }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  return (
    <div className="avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.34 }}>
      {initials}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────
const STATUS_MAP = {
  published:    ['Published',    'badge-green'],
  'in-progress':['In progress',  'badge-amber'],
  new:          ['Not started',  'badge-gray'],
  tagged:       ['Tagged',       'badge-green'],
  tagging:      ['AI tagging…',  'badge-purple'],
  uploading:    ['Uploading…',   'badge-gray'],
  ready:        ['Poses ready',  'badge-amber'],
  order:        ['Order',        'badge-brand'],
  enquiry:      ['Enquiry',      'badge-green'],
}

export function StatusBadge({ status }) {
  const [label, cls] = STATUS_MAP[status] || [status, 'badge-gray']
  return <span className={`badge ${cls}`}>{label}</span>
}

// ─── Field row ────────────────────────────────────────────────
export function FieldRow({ label, value, onChange, aiTagged = false, type = 'text', placeholder = '' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--gray-400)', width: 88, flexShrink: 0 }}>{label}</span>
      <input
        type={type}
        className="input"
        style={{ flex: 1, fontSize: 13, padding: '5px 9px' }}
        value={value || ''}
        placeholder={placeholder || label}
        onChange={e => onChange(e.target.value)}
      />
      {aiTagged && <span className="badge badge-purple" style={{ flexShrink: 0 }}>AI</span>}
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────
export function Spinner({ size = 18, color = 'var(--brand)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="10" />
    </svg>
  )
}

// ─── Empty state ──────────────────────────────────────────────
export function EmptyState({ icon = '○', title, message, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────
export function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: width, boxShadow: 'var(--shadow-lg)', animation: 'fadeIn .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-900)' }}>{title}</span>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Toast context ────────────────────────────────────────────
const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((message, type = 'default') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' && '✓ '}
            {t.type === 'error' && '✕ '}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

// ─── Garment image placeholder ────────────────────────────────
const POSE_COLORS = [
  ['#F7EEF1','#8C3F57'],['#E8F5ED','#0D6B3A'],['#F0EFFE','#5B21B6'],
  ['#FEF3E2','#92400E'],['#EFF6FF','#1D4ED8'],['#F0FDF4','#166534'],
]

export function GarmentThumb({ garment, index = 0, selected, onClick, size = 'md' }) {
  const h = size === 'sm' ? 72 : 90
  const [bg, fg] = POSE_COLORS[index % 6]
  return (
    <div onClick={onClick} style={{ border: `${selected ? 2 : 1}px solid ${selected ? 'var(--brand)' : 'var(--gray-200)'}`, borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer', background: '#fff', transition: 'border-color .15s' }}>
      <div style={{ height: h, background: garment.image_url ? `url(${garment.image_url}) center/cover` : bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, color: fg }}>
        {!garment.image_url && (garment.name?.[0] || '?')}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{garment.name || 'Tagging…'}</div>
        <div style={{ marginTop: 3 }}><StatusBadge status={garment.status} /></div>
      </div>
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────
export function Confirm({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel, danger = false }) {
  return (
    <Modal title={title} onClose={onCancel} width={400}>
      <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 20 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-default" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? 'btn-primary' : 'btn-primary'}`} style={danger ? { background: 'var(--red-fg)', borderColor: 'var(--red-fg)' } : {}} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}
