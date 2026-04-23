import { useEffect, useRef, useState } from 'react'
import { FIELDS, SECTIONS } from './aprovacoesEntradasFiscaisFields.js'

function valueToInput(f, v) {
  if (v === null || v === undefined) return ''
  if (f.kind === 'date') return String(v).slice(0, 10)
  return String(v)
}

export default function AprovacaoEntradaFiscalForm({ initial, submitting, onCancel, onSave }) {
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState(() => {
    const init = {}
    for (const f of FIELDS) init[f.name] = valueToInput(f, initial?.[f.name])
    return init
  })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const firstRef = useRef(null)

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  function set(name, v) {
    setForm((s) => ({ ...s, [name]: v }))
  }

  function validateClient() {
    const e = {}
    for (const f of FIELDS) {
      const v = String(form[f.name] ?? '').trim()
      if (f.required && !v) { e[f.name] = 'obrigatório'; continue }
      if (!v) continue
      if (f.kind === 'numeric') {
        const n = Number(v.replace(/\./g, '').replace(',', '.'))
        if (!Number.isFinite(n)) e[f.name] = 'número inválido'
      } else if (f.kind === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) e[f.name] = 'data inválida (use YYYY-MM-DD)'
      } else if (f.maxLen && v.length > f.maxLen) {
        e[f.name] = `máximo ${f.maxLen} caracteres`
      }
    }
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const v = validateClient()
    setErrors(v)
    if (Object.keys(v).length) return

    const payload = {}
    for (const f of FIELDS) {
      const raw = String(form[f.name] ?? '').trim()
      if (!raw) { payload[f.name] = null; continue }
      if (f.kind === 'numeric') {
        payload[f.name] = Number(raw.replace(/\./g, '').replace(',', '.'))
      } else {
        payload[f.name] = raw
      }
    }

    const result = await onSave(payload)
    if (result && !result.ok) {
      setBanner(result.message || 'Falha ao salvar')
      if (result.fields) setErrors(result.fields)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !submitting) onCancel()
    }}>
      <form className="modal modal-xl" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h2>{editing ? `Editar aprovação #${initial.id}` : 'Nova aprovação de entrada fiscal'}</h2>
          <p>Preencha os dados da aprovação do documento fiscal.</p>
        </div>

        <div className="modal-body">
          {banner && <div className="banner">{banner}</div>}

          {SECTIONS.map((section) => (
            <fieldset key={section} className="form-section">
              <legend>{section}</legend>
              <div className="form-grid">
                {FIELDS.filter(f => f.section === section).map((f, idx) => {
                  const first = idx === 0 && section === SECTIONS[0]
                  const err = errors[f.name]
                  return (
                    <div key={f.name} className={`field ${err ? 'has-error' : ''}`}>
                      <label htmlFor={`f-${f.name}`}>
                        {f.label}{f.required && <span className="req">*</span>}
                      </label>
                      <input
                        id={`f-${f.name}`}
                        ref={first ? firstRef : undefined}
                        type={f.kind === 'date' ? 'date' : 'text'}
                        inputMode={f.kind === 'numeric' ? 'decimal' : undefined}
                        maxLength={f.maxLen}
                        value={form[f.name]}
                        onChange={(e) => set(f.name, e.target.value)}
                        autoComplete="off"
                      />
                      {err && <div className="hint"><span className="error-msg">{err}</span></div>}
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Salvando…' : (editing ? 'Salvar alterações' : 'Criar')}
          </button>
        </div>
      </form>
    </div>
  )
}
