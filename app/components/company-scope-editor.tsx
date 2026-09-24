'use client'

import { useMemo, useState } from 'react'

export type JurisdictionValue = {
  country: string
  state: string
  locality?: string
}

export const TRADE_OPTIONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'refrigeration', label: 'Refrigeration' },
  { value: 'hydronics', label: 'Hydronics' },
  { value: 'boilers', label: 'Boilers' },
  { value: 'maintenance', label: 'Maintenance' },
] as const

export const US_STATE_OPTIONS = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ['DC','District of Columbia'],
] as const

const stateName = new Map<string, string>(US_STATE_OPTIONS.map(([code, name]) => [code, name]))

export default function CompanyScopeEditor({
  trades,
  onTradesChange,
  jurisdictions,
  onJurisdictionsChange,
  timezone,
  onTimezoneChange,
  disabled = false,
}: {
  trades: string[]
  onTradesChange: (trades: string[]) => void
  jurisdictions: JurisdictionValue[]
  onJurisdictionsChange: (jurisdictions: JurisdictionValue[]) => void
  timezone: string
  onTimezoneChange: (timezone: string) => void
  disabled?: boolean
}) {
  const [stateToAdd, setStateToAdd] = useState('')

  const configuredStates = useMemo(
    () => new Set(jurisdictions.map((item) => item.state.toUpperCase())),
    [jurisdictions]
  )

  const toggleTrade = (trade: string) => {
    if (disabled) return
    if (trades.includes(trade)) {
      if (trades.length === 1) return
      onTradesChange(trades.filter((item) => item !== trade))
    } else {
      onTradesChange([...trades, trade])
    }
  }

  const addState = () => {
    if (!stateToAdd || configuredStates.has(stateToAdd)) return
    onJurisdictionsChange([...jurisdictions, { country: 'US', state: stateToAdd }])
    setStateToAdd('')
  }

  const removeState = (state: string) => {
    if (disabled || jurisdictions.length === 1) return
    onJurisdictionsChange(jurisdictions.filter((item) => item.state.toUpperCase() !== state.toUpperCase()))
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={labelStyle}>Trades</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 7 }}>
          {TRADE_OPTIONS.map((trade) => {
            const active = trades.includes(trade.value)
            return (
              <button
                key={trade.value}
                type="button"
                disabled={disabled}
                onClick={() => toggleTrade(trade.value)}
                style={{
                  ...chipButtonStyle,
                  background: active ? '#082B4D' : '#fff',
                  color: active ? '#fff' : '#334155',
                  borderColor: active ? '#082B4D' : '#cbd5e1',
                  opacity: disabled ? 0.65 : 1,
                }}
              >
                {trade.label}
              </button>
            )
          })}
        </div>
        <div style={helpStyle}>At least one trade must stay enabled.</div>
      </div>

      <div>
        <div style={labelStyle}>Jurisdictions</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 7 }}>
          <select value={stateToAdd} disabled={disabled} onChange={(event) => setStateToAdd(event.target.value)} style={selectStyle}>
            <option value="">Add a state…</option>
            {US_STATE_OPTIONS.filter(([code]) => !configuredStates.has(code)).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button type="button" disabled={disabled || !stateToAdd} onClick={addState} style={addButtonStyle}>Add State</button>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
          {jurisdictions.map((item) => (
            <span key={`${item.country}-${item.state}-${item.locality || ''}`} style={jurisdictionChipStyle}>
              {item.locality ? `${item.locality}, ${item.state}` : (stateName.get(item.state.toUpperCase()) || item.state)}
              <button
                type="button"
                disabled={disabled || jurisdictions.length === 1}
                title={jurisdictions.length === 1 ? 'A company must keep at least one jurisdiction.' : 'Remove jurisdiction'}
                onClick={() => removeState(item.state)}
                style={removeButtonStyle}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={helpStyle}>A company can operate in multiple states. Conversation-level jurisdiction still controls code-sensitive answers.</div>
      </div>

      <label style={labelStyle}>
        Timezone
        <input
          list="craftcompass-timezones"
          value={timezone}
          disabled={disabled}
          onChange={(event) => onTimezoneChange(event.target.value)}
          style={{ ...selectStyle, marginTop: 7 }}
        />
        <datalist id="craftcompass-timezones">
          <option value="America/New_York" />
          <option value="America/Indiana/Indianapolis" />
          <option value="America/Chicago" />
          <option value="America/Denver" />
          <option value="America/Phoenix" />
          <option value="America/Los_Angeles" />
          <option value="America/Anchorage" />
          <option value="Pacific/Honolulu" />
        </datalist>
      </label>
    </div>
  )
}

const labelStyle: React.CSSProperties = { color:'#475569', fontSize:12, fontWeight:800 }
const helpStyle: React.CSSProperties = { marginTop:6, color:'#94a3b8', fontSize:11, lineHeight:1.4 }
const chipButtonStyle: React.CSSProperties = { border:'1px solid', borderRadius:999, padding:'7px 10px', fontSize:12, fontWeight:800, cursor:'pointer' }
const selectStyle: React.CSSProperties = { boxSizing:'border-box', minWidth:190, padding:'9px 10px', border:'1px solid #cbd5e1', borderRadius:9, background:'#fff', color:'#172033', fontSize:13 }
const addButtonStyle: React.CSSProperties = { border:0, borderRadius:9, padding:'9px 11px', background:'#172033', color:'#fff', fontSize:12, fontWeight:800, cursor:'pointer' }
const jurisdictionChipStyle: React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:7, padding:'6px 8px 6px 10px', border:'1px solid #cbd5e1', borderRadius:999, background:'#f8fafc', color:'#334155', fontSize:12, fontWeight:750 }
const removeButtonStyle: React.CSSProperties = { width:20, height:20, border:0, borderRadius:'50%', background:'#e2e8f0', color:'#475569', cursor:'pointer', lineHeight:1, fontSize:15 }
