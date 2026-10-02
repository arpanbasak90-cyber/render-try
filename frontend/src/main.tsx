import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowRight, Beaker, Check, ChevronDown, CircleAlert, Database, Droplets, LogOut, MapPin, Menu, RefreshCw, ShieldCheck, Signal, TableProperties, X } from 'lucide-react'
import './styles.css'

type StateOption = { code: string; name: string }
type District = { state_code: string; name: string }
type User = { email: string; name: string; sub: string }
type Session = { access_token: string; user: User }
type Sample = { sample_id: string; measured_at: string; region?: { location_text?: string; district_name?: string }; final_values?: Record<string, number>; verdict?: { state?: string; reasons?: string[] } }
type Health = { db: string; transport: string; device_status: string; server_time: string }

const API = '/api/v1'
const labels = [['ph', 'pH', ''], ['tds_mgl', 'TDS', 'mg/L'], ['turbidity_ntu', 'Turbidity', 'NTU'], ['temp_c', 'Temperature', '°C']] as const

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail?.message || body.error?.message || `Request failed (${response.status})`)
  return body as T
}

function loadSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem('jalraksha.session') || 'null') } catch { return null }
}

function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [region, setRegion] = useState<{ stateCode: string; stateName: string; districtName: string } | null>(() => { try { return JSON.parse(sessionStorage.getItem('jalraksha.region') || 'null') } catch { return null } })
  const [states, setStates] = useState<StateOption[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [stateCode, setStateCode] = useState('JH')
  const [districtName, setDistrictName] = useState('')
  const [samples, setSamples] = useState<Sample[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const googleButton = useRef<HTMLDivElement>(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  useEffect(() => { request<{ items: StateOption[] }>('/meta/states').then(result => setStates(result.items)).catch(e => setError(e.message)) }, [])
  useEffect(() => {
    setDistricts([]); setDistrictName('')
    request<{ items: District[] }>(`/meta/states/${encodeURIComponent(stateCode)}/districts`).then(result => { setDistricts(result.items); setDistrictName(result.items[0]?.name || '') }).catch(e => setError(e.message))
  }, [stateCode])
  useEffect(() => {
    if (!googleClientId || session || !googleButton.current) return
    const mount = () => { if (!window.google || !googleButton.current) return; window.google.accounts.id.initialize({ client_id: googleClientId, callback: response => handleGoogle(response.credential) }); googleButton.current.replaceChildren(); window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', width: 360, text: 'continue_with', shape: 'rectangular' }) }
    if (window.google) mount(); else { const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.onload = mount; document.head.appendChild(script) }
  }, [googleClientId, session])
  useEffect(() => { if (session && region) loadDashboard() }, [session, region])

  async function handleGoogle(credential: string) {
    setBusy(true); setError('')
    try { const next = await request<Session>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }); sessionStorage.setItem('jalraksha.session', JSON.stringify(next)); setSession(next) } catch (e) { setError(e instanceof Error ? e.message : 'Google authentication failed.') } finally { setBusy(false) }
  }
  async function chooseRegion() {
    if (!session || !districtName) return
    setBusy(true); setError('')
    const state = states.find(item => item.code === stateCode)
    try { const selected = { stateCode, stateName: state?.name || stateCode, districtName }; await request('/auth/region', { method: 'POST', body: JSON.stringify(selected) }, session.access_token); sessionStorage.setItem('jalraksha.region', JSON.stringify(selected)); setRegion(selected) } catch (e) { setError(e instanceof Error ? e.message : 'Could not save region.') } finally { setBusy(false) }
  }
  async function loadDashboard() { setBusy(true); try { const [sampleData, healthData] = await Promise.all([request<{ items: Sample[] }>('/samples', undefined, session?.access_token), request<Health>('/health', undefined, session?.access_token)]); setSamples(sampleData.items || []); setHealth(healthData) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load dashboard.') } finally { setBusy(false) } }
  function signOut() { sessionStorage.clear(); setSession(null); setRegion(null); setSamples([]); setHealth(null) }

  if (!session) return <AuthShell error={error} googleClientId={googleClientId} googleButton={googleButton} busy={busy} />
  if (!region) return <RegionShell user={session.user} states={states} districts={districts} stateCode={stateCode} setStateCode={setStateCode} districtName={districtName} setDistrictName={setDistrictName} onContinue={chooseRegion} onSignOut={signOut} error={error} busy={busy} />
  return <Dashboard user={session.user} region={region} health={health} samples={samples} search={search} setSearch={setSearch} onRefresh={loadDashboard} onSignOut={signOut} busy={busy} error={error} />
}

function Brand() { return <div className="brand"><span className="brand-mark"><Droplets size={19} /></span><span><b>JALRAKSHA</b><small>FIELD WATER INTELLIGENCE</small></span></div> }
function AuthShell({ error, googleClientId, googleButton, busy }: { error: string; googleClientId?: string; googleButton: React.RefObject<HTMLDivElement | null>; busy: boolean }) { return <div className="portal auth-shell"><header className="public-nav"><Brand /><span className="status-dot"><span /> SECURE OPERATOR ACCESS</span></header><main className="auth-layout"><section className="auth-copy"><span className="eyebrow">FIELD OPERATIONS / 01</span><h1>Water intelligence for the places that need it most.</h1><p>JALRAKSHA brings transparent, field-ready water quality monitoring to rural operators across Jharkhand, West Bengal, and Bihar.</p><div className="promise-list"><div><ShieldCheck /> <span><b>Verified access</b><small>Continue with your real Google account.</small></span></div><div><MapPin /> <span><b>Region-scoped workspace</b><small>Select your operating district after sign-in.</small></span></div><div><Activity /> <span><b>Evidence, not assumptions</b><small>Only records returned by the backend appear in the console.</small></span></div></div></section><section className="auth-card"><span className="step-tag">STEP 01 / AUTHENTICATE</span><h2>Sign in to your field workspace</h2><p>Your Google identity is verified by the JALRAKSHA backend. No password is collected here.</p>{googleClientId ? <div ref={googleButton} className="google-button" /> : <div className="setup-callout"><CircleAlert size={18} /><span>Google sign-in is not configured yet. Add <code>VITE_GOOGLE_CLIENT_ID</code> to the frontend and <code>GOOGLE_CLIENT_ID</code> plus <code>JWT_SECRET</code> to the backend.</span></div>}{busy && <p className="form-note">Verifying your Google account…</p>}{error && <div className="error-box" role="alert">{error}</div>}<div className="auth-note"><ShieldCheck size={15} /> Dashboard remains locked until authentication and region selection are complete.</div></section></main><footer className="public-footer"><span>© 2026 JALRAKSHA</span><span>Sensor readings are not a substitute for laboratory certification.</span></footer></div> }

function RegionShell({ user, states, districts, stateCode, setStateCode, districtName, setDistrictName, onContinue, onSignOut, error, busy }: { user: User; states: StateOption[]; districts: District[]; stateCode: string; setStateCode: (v: string) => void; districtName: string; setDistrictName: (v: string) => void; onContinue: () => void; onSignOut: () => void; error: string; busy: boolean }) { return <div className="portal region-shell"><header className="public-nav"><Brand /><div className="identity"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.email}</span><button className="icon-button" onClick={onSignOut} title="Sign out"><LogOut size={16} /></button></div></header><main className="region-layout"><div><span className="eyebrow">STEP 02 / DEPLOYMENT CONTEXT</span><h1>Where are you operating today?</h1><p>Choose the state and district for this session. The dashboard will be scoped to this operating region.</p></div><section className="region-card"><div className="step-progress"><span className="complete"><Check size={14} /> Account verified</span><span className="current">02 Region</span><span>03 Workspace</span></div><label>State<select value={stateCode} onChange={e => setStateCode(e.target.value)}>{states.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}</select></label><label>District<select value={districtName} onChange={e => setDistrictName(e.target.value)} disabled={!districts.length}>{districts.map(district => <option key={district.name} value={district.name}>{district.name}</option>)}</select></label><button className="primary-button" onClick={onContinue} disabled={busy || !districtName}>Open regional workspace <ArrowRight size={17} /></button>{error && <div className="error-box" role="alert">{error}</div>}<p className="form-note"><MapPin size={14} /> Region selection is required before any samples or dashboard data can be requested.</p></section></main></div> }

function Dashboard({ user, region, health, samples, search, setSearch, onRefresh, onSignOut, busy, error }: { user: User; region: { stateName: string; districtName: string }; health: Health | null; samples: Sample[]; search: string; setSearch: (v: string) => void; onRefresh: () => void; onSignOut: () => void; busy: boolean; error: string }) { const visible = useMemo(() => samples.filter(sample => `${sample.sample_id} ${sample.region?.location_text || ''} ${sample.region?.district_name || ''}`.toLowerCase().includes(search.toLowerCase())), [samples, search]); const latest = samples[0]; return <div className="dashboard"><aside className="sidebar"><Brand /><span className="side-label">WORKSPACE</span><button className="nav-item active"><Activity size={17} /> Overview</button><button className="nav-item"><Beaker size={17} /> Analyse water</button><button className="nav-item"><TableProperties size={17} /> Sample history</button><button className="nav-item"><Database size={17} /> Devices</button><div className="sidebar-spacer" /><div className="connection"><span className="live-dot" /> {health?.device_status || 'offline'} / {health?.transport || 'backend'}<small>Region locked · {region.districtName}</small></div><button className="logout-button" onClick={onSignOut}><LogOut size={16} /> Sign out</button></aside><main className="dashboard-main"><header className="dashboard-header"><div><span className="eyebrow">JALRAKSHA / MONITORING CONSOLE</span><h1>Good morning, {user.name.split(' ')[0]}</h1><p><MapPin size={14} /> {region.districtName}, {region.stateName}</p></div><div className="header-actions"><span className="identity compact"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>{user.email}</span><button className="secondary-button" onClick={onRefresh} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh</button></div></header><div className="dashboard-content">{error && <div className="error-box" role="alert">{error}</div>}<section className="kpi-grid"><Kpi label="Real samples" value={samples.length} detail="Returned by backend" /><Kpi label="Device status" value={health?.device_status || '—'} detail={health?.transport || 'Not reported'} /><Kpi label="Database" value={health?.db || '—'} detail="Current backend state" /><Kpi label="Region" value={region.districtName} detail={region.stateName} /></section><div className="section-heading"><div><span className="eyebrow">LATEST EVIDENCE</span><h2>Latest stored measurement</h2></div><span className="record-count">{samples.length} records loaded</span></div>{latest ? <section className="sensor-grid">{labels.map(([key, label, unit]) => <article className="sensor-card" key={key}><span>{label}</span><strong>{latest.final_values?.[key] ?? '—'} <small>{unit}</small></strong><em>Stored measurement · {latest.sample_id}</em></article>)}</section> : <section className="empty-state"><Database size={24} /><h3>No real measurements in this region</h3><p>The backend returned no records. No demo or synthetic readings are shown.</p></section>}<section className="panel"><div className="panel-heading"><div><span className="eyebrow">AUDITABLE RECORDS</span><h2>Sample history</h2></div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sample ID or location" /></div>{visible.length ? <div className="table-wrap"><table><thead><tr><th>Sample ID</th><th>Location</th><th>Measured</th><th>Verdict</th></tr></thead><tbody>{visible.map(sample => <tr key={sample.sample_id}><td className="mono">{sample.sample_id}</td><td>{sample.region?.location_text || sample.region?.district_name || '—'}</td><td>{new Date(sample.measured_at).toLocaleString()}</td><td><span className={`verdict ${sample.verdict?.state?.toLowerCase().replaceAll(' ', '-') || 'unknown'}`}>{sample.verdict?.state || 'UNKNOWN'}</span></td></tr>)}</tbody></table></div> : <div className="table-empty">No matching records returned by the backend.</div>}</section><section className="notice"><CircleAlert size={20} /><div><b>Scientific limitation</b><p>These sensors cannot detect fluoride, arsenic, iron, nitrate, or bacteria. Use an approved field kit or laboratory test for potable-water certification.</p></div></section></div></main></div> }
function Kpi({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <article className="kpi"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article> }

createRoot(document.getElementById('root')!).render(<App />)
