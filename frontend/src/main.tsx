import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowRight, Beaker, Check, ChevronDown, CircleAlert, Database, Droplets, LogOut, MapPin, RefreshCw, ShieldCheck, TableProperties } from 'lucide-react'
import './styles.css'

type StateOption = { code: string; name: string }
type District = { state_code: string; name: string }
type User = { email: string; name: string; sub: string }
type Session = { access_token: string; user: User }
type Sample = {
  sample_id: string
  measured_at: string
  region?: { location_text?: string; district_name?: string }
  final_values?: Record<string, number>
  verdict?: { state?: string; reasons?: string[] }
}
type SampleResponse = { items: Sample[]; total?: number; limit?: number; offset?: number }
type Health = { db: string; transport: string; device_status: string; server_time: string; version?: string }
type DashboardTab = 'overview' | 'analyse' | 'history' | 'devices'
type DashboardStatus = 'idle' | 'loading' | 'ready' | 'error'
type Region = { stateCode: string; stateName: string; districtName: string }
type Device = { id: string; transport: string; status: string; port?: string | null; baud?: number; hello?: { device: string; version: string } | null; last_seen?: string | null }
type Analysis = { id: string; status: string; reading_count?: number; final_values?: Record<string, number>; verdict?: Sample['verdict']; completed_at?: string; persisted?: boolean }
type Reading = { sequence: number; ph: number; tds_mgl: number; turbidity_ntu: number; temp_c: number }
class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

type MetricLabel = readonly [string, string, string]
const API = '/api/v1'
const labels: MetricLabel[] = [['ph', 'pH', ''], ['tds_mgl', 'TDS', 'mg/L'], ['turbidity_ntu', 'Turbidity', 'NTU'], ['temp_c', 'Temperature', '°C']]

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : body.detail?.message || body.error?.message
    throw new ApiError(detail || `Request failed (${response.status})`, response.status)
  }
  return body as T
}

function loadSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem('jalraksha.session') || 'null') } catch { return null }
}

function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [region, setRegion] = useState<Region | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('jalraksha.region') || 'null') } catch { return null }
  })
  const [states, setStates] = useState<StateOption[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [stateCode, setStateCode] = useState('JH')
  const [districtName, setDistrictName] = useState('')
  const [samples, setSamples] = useState<Sample[]>([])
  const [samplesTotal, setSamplesTotal] = useState(0)
  const [pageOffset, setPageOffset] = useState(0)
  const [health, setHealth] = useState<Health | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sampleStatus, setSampleStatus] = useState<DashboardStatus>(() => session && region ? 'loading' : 'idle')
  const [healthStatus, setHealthStatus] = useState<DashboardStatus>(() => session && region ? 'loading' : 'idle')
  const requestGeneration = useRef(0)
  const googleButton = useRef<HTMLDivElement>(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  useEffect(() => {
    request<{ items: StateOption[] }>('/meta/states')
      .then(result => setStates(result.items))
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    setDistricts([])
    setDistrictName('')
    request<{ items: District[] }>(`/meta/states/${encodeURIComponent(stateCode)}/districts`)
      .then(result => { setDistricts(result.items); setDistrictName(result.items[0]?.name || '') })
      .catch(e => setError(e.message))
  }, [stateCode])

  useEffect(() => {
    if (!googleClientId || session || !googleButton.current) return
    const mount = () => {
      if (!window.google || !googleButton.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        auto_select: false,
        context: 'signin',
        callback: response => handleGoogle(response.credential),
      })
      googleButton.current.replaceChildren()
      window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', width: 360, text: 'continue_with', shape: 'rectangular' })
    }
    if (window.google) mount()
    else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = mount
      document.head.appendChild(script)
    }
  }, [googleClientId, session])

  useEffect(() => { if (session && region) loadDashboard() }, [session, region])

  async function handleGoogle(credential: string) {
    setBusy(true)
    setError('')
    try {
      const next = await request<Session>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) })
      sessionStorage.setItem('jalraksha.session', JSON.stringify(next))
      setSession(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google authentication failed.')
    } finally { setBusy(false) }
  }

  async function chooseRegion() {
    if (!session || !districtName) return
    setBusy(true)
    setError('')
    const state = states.find(item => item.code === stateCode)
    try {
      const selected = { state_code: stateCode, state_name: state?.name || stateCode, district_name: districtName }
      await request('/auth/region', { method: 'POST', body: JSON.stringify(selected) }, session.access_token)
      const localRegion = { stateCode, stateName: state?.name || stateCode, districtName }
      sessionStorage.setItem('jalraksha.region', JSON.stringify(localRegion))
      setRegion(localRegion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save region.')
    } finally { setBusy(false) }
  }

  async function loadDashboard(offset = pageOffset) {
    if (!session || !region) return
    const generation = ++requestGeneration.current
    setBusy(true)
    setError('')
    setSampleStatus('loading')
    setHealthStatus('loading')
    const [sampleResult, healthResult] = await Promise.allSettled([
      request<SampleResponse>(`/samples?limit=50&offset=${offset}`, undefined, session.access_token),
      request<Health>('/health', undefined, session.access_token),
    ])
    if (generation !== requestGeneration.current) return
    const failures: string[] = []
    if (sampleResult.status === 'fulfilled') {
      setSamples(sampleResult.value.items || [])
      setSamplesTotal(sampleResult.value.total ?? sampleResult.value.items?.length ?? 0)
      setPageOffset(offset)
      setSampleStatus('ready')
    } else {
      setSampleStatus('error')
      failures.push(`Measurements: ${errorMessage(sampleResult.reason, 'Could not load measurements.')}`)
    }
    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value)
      setHealthStatus('ready')
    } else {
      setHealthStatus('error')
      failures.push(`System status: ${errorMessage(healthResult.reason, 'Could not load system status.')}`)
    }
    setError(failures.join(' '))
    setBusy(false)
  }

  function signOut() {
    ++requestGeneration.current
    sessionStorage.clear()
    setSession(null)
    setRegion(null)
    setSamples([])
    setSamplesTotal(0)
    setHealth(null)
    setPageOffset(0)
    setSearch('')
    setBusy(false)
    setError('')
    setSampleStatus('idle')
    setHealthStatus('idle')
  }

  if (!session) return <AuthShell error={error} googleClientId={googleClientId} googleButton={googleButton} busy={busy} />
  if (!region) return <RegionShell user={session.user} states={states} districts={districts} stateCode={stateCode} setStateCode={setStateCode} districtName={districtName} setDistrictName={setDistrictName} onContinue={chooseRegion} onSignOut={signOut} error={error} busy={busy} />
  return <Dashboard user={session.user} token={session.access_token} region={region} health={health} samples={samples} samplesTotal={samplesTotal} pageOffset={pageOffset} search={search} setSearch={setSearch} onPageChange={loadDashboard} onRefresh={() => loadDashboard()} onSignOut={signOut} busy={busy} error={error} status={sampleStatus} healthStatus={healthStatus} />
}

function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
function locationFor(sample: Sample) { return sample.region?.location_text || sample.region?.district_name || 'Location not recorded' }
function verdictClass(state?: string) { return state?.toLowerCase().replaceAll(' ', '-') || 'unknown' }

function Brand() {
  return <div className="brand"><span className="brand-mark"><Droplets size={19} /></span><span><b>JALRAKSHA</b><small>FIELD WATER INTELLIGENCE</small></span></div>
}

function AuthShell({ error, googleClientId, googleButton, busy }: { error: string; googleClientId?: string; googleButton: React.RefObject<HTMLDivElement | null>; busy: boolean }) {
  return <div className="portal auth-shell"><header className="public-nav"><Brand /><span className="status-dot"><span /> SECURE OPERATOR ACCESS</span></header><main className="auth-layout"><section className="auth-copy"><span className="eyebrow">FIELD OPERATIONS / 01</span><h1>Water intelligence for the places that need it most.</h1><p>JALRAKSHA brings transparent, field-ready water quality monitoring to rural operators across Jharkhand, West Bengal, and Bihar.</p><div className="promise-list"><div><ShieldCheck /> <span><b>Verified access</b><small>Continue with your real Google account.</small></span></div><div><MapPin /> <span><b>Region-scoped workspace</b><small>Select your operating district after sign-in.</small></span></div><div><Activity /> <span><b>Evidence, not assumptions</b><small>Only records returned by the backend appear in the console.</small></span></div></div></section><section className="auth-card"><span className="step-tag">STEP 01 / AUTHENTICATE</span><h2>Sign in to your field workspace</h2><p>Your Google identity is verified by the JALRAKSHA backend. No password is collected here.</p>{googleClientId ? <div ref={googleButton} className="google-button" /> : <div className="setup-callout"><CircleAlert size={18} /><span>Google sign-in is not configured yet. Add <code>VITE_GOOGLE_CLIENT_ID</code> to the frontend and <code>GOOGLE_CLIENT_ID</code> plus <code>JWT_SECRET</code> to the backend.</span></div>}{busy && <p className="form-note">Verifying your Google account…</p>}{error && <div className="error-box" role="alert">{error}</div>}<div className="auth-note"><ShieldCheck size={15} /> Dashboard remains locked until authentication and region selection are complete.</div></section></main><footer className="public-footer"><span>© 2026 JALRAKSHA</span><span>Sensor readings are not a substitute for laboratory certification.</span></footer></div>
}

function RegionShell({ user, states, districts, stateCode, setStateCode, districtName, setDistrictName, onContinue, onSignOut, error, busy }: { user: User; states: StateOption[]; districts: District[]; stateCode: string; setStateCode: (v: string) => void; districtName: string; setDistrictName: (v: string) => void; onContinue: () => void; onSignOut: () => void; error: string; busy: boolean }) {
  return <div className="portal region-shell"><header className="public-nav"><Brand /><div className="identity"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.email}</span><button className="icon-button" onClick={onSignOut} title="Sign out"><LogOut size={16} /></button></div></header><main className="region-layout"><div><span className="eyebrow">STEP 02 / DEPLOYMENT CONTEXT</span><h1>Where are you operating today?</h1><p>Choose the state and district for this session. This region provides the deployment context for new analyses.</p></div><section className="region-card"><div className="step-progress"><span className="complete"><Check size={14} /> Account verified</span><span className="current">02 Region</span><span>03 Workspace</span></div><label>State<select value={stateCode} onChange={e => setStateCode(e.target.value)}>{states.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}</select></label><label>District<select value={districtName} onChange={e => setDistrictName(e.target.value)} disabled={!districts.length}>{districts.map(district => <option key={district.name} value={district.name}>{district.name}</option>)}</select></label><button className="primary-button" onClick={onContinue} disabled={busy || !districtName}>Open regional workspace <ArrowRight size={17} /></button>{error && <div className="error-box" role="alert">{error}</div>}<p className="form-note"><MapPin size={14} /> Region selection is required before any samples or dashboard data can be requested.</p></section></main></div>
}

function Dashboard({ user, token, region, health, samples, samplesTotal, pageOffset, search, setSearch, onPageChange, onRefresh, onSignOut, busy, error, status, healthStatus }: { user: User; token: string; region: Region; health: Health | null; samples: Sample[]; samplesTotal: number; pageOffset: number; search: string; setSearch: (v: string) => void; onPageChange: (offset: number) => void; onRefresh: () => void; onSignOut: () => void; busy: boolean; error: string; status: DashboardStatus; healthStatus: DashboardStatus }) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [selectedSampleId, setSelectedSampleId] = useState('')
  const visible = useMemo(() => samples.filter(sample => `${sample.sample_id} ${locationFor(sample)}`.toLowerCase().includes(search.toLowerCase())), [samples, search])
  const latest = samples[0]
  const selectedSample = samples.find(sample => sample.sample_id === selectedSampleId) || latest

  useEffect(() => {
    if (latest && !samples.some(sample => sample.sample_id === selectedSampleId)) setSelectedSampleId(latest.sample_id)
  }, [latest, samples, selectedSampleId])

  function inspectSample(sampleId: string) {
    setSelectedSampleId(sampleId)
    setActiveTab('analyse')
  }

  return <div className="dashboard"><aside className="sidebar"><Brand /><span className="side-label">WORKSPACE</span><NavButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<Activity size={17} />}>Overview</NavButton><NavButton active={activeTab === 'analyse'} onClick={() => setActiveTab('analyse')} icon={<Beaker size={17} />}>Analyse water</NavButton><NavButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<TableProperties size={17} />}>Sample history</NavButton><NavButton active={activeTab === 'devices'} onClick={() => setActiveTab('devices')} icon={<Database size={17} />}>Devices</NavButton><div className="sidebar-spacer" /><div className="connection"><span className={`live-dot ${health?.device_status === 'offline' ? 'offline' : ''}`} /> {health?.device_status || 'status unavailable'} / {health?.transport || 'transport unavailable'}<small>Region locked · {region.districtName}</small></div><button className="logout-button" onClick={onSignOut}><LogOut size={16} /> Sign out</button></aside><main className="dashboard-main"><header className="dashboard-header"><div><span className="eyebrow">JALRAKSHA / MONITORING CONSOLE</span><h1>Good morning, {user.name.split(' ')[0]}</h1><p><MapPin size={14} /> {region.districtName}, {region.stateName}</p></div><div className="header-actions"><span className="identity compact"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>{user.email}</span><button className="secondary-button" onClick={onRefresh} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh</button></div></header><div className="dashboard-content">{error && <div className="error-box dashboard-error" role="alert"><span>{error}</span><button className="inline-button" onClick={onRefresh} disabled={busy}>Try again</button></div>}{status === 'loading' && <div className="loading-strip"><RefreshCw size={15} className="spin" /> Loading records returned by the backend…</div>}{activeTab === 'overview' && <Overview samples={samples} samplesTotal={samplesTotal} health={health} region={region} status={status} onRetry={onRefresh} onInspect={inspectSample} />}{activeTab === 'analyse' && <><LiveAnalysis token={token} region={region} transport={health?.transport} onComplete={() => onPageChange(0)} /><AnalyseWater samples={samples} selectedSample={selectedSample} selectedSampleId={selectedSampleId} setSelectedSampleId={setSelectedSampleId} status={status} onRetry={onRefresh} /></>}{activeTab === 'history' && <SampleHistory samples={visible} loadedCount={samples.length} total={samplesTotal} pageOffset={pageOffset} onPageChange={onPageChange} search={search} setSearch={setSearch} status={status} onRetry={onRefresh} onInspect={inspectSample} />}{activeTab === 'devices' && <Devices token={token} health={health} status={healthStatus} onRetry={onRefresh} />}</div></main></div>
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>{icon}{children}</button>
}

function Overview({ samples, samplesTotal, health, region, status, onRetry, onInspect }: { samples: Sample[]; samplesTotal: number; health: Health | null; region: Region; status: DashboardStatus; onRetry: () => void; onInspect: (sampleId: string) => void }) {
  const latest = samples[0]
  return <><section className="kpi-grid"><Kpi label="Real samples" value={status === 'loading' && !samples.length ? '…' : samplesTotal} detail="Returned by backend" /><Kpi label="Device status" value={health?.device_status || '—'} detail={health?.transport || 'Not reported'} /><Kpi label="Database" value={health?.db || '—'} detail="Current backend state" /><Kpi label="Region" value={region.districtName} detail={region.stateName} /></section><div className="section-heading"><div><span className="eyebrow">LATEST EVIDENCE</span><h2>Latest stored measurement</h2></div><span className="record-count">{samplesTotal} records available</span></div>{status === 'loading' && !samples.length ? <LoadingState label="Loading real measurements…" /> : latest ? <section className="sensor-grid"><MeasurementCards sample={latest} /></section> : status === 'error' ? <ErrorState title="Measurements could not be loaded" onRetry={onRetry} /> : <EmptyState icon={<Database size={24} />} title="No real measurements returned" description="The backend returned no records. No demo or synthetic readings are shown." />}<section className="panel"><div className="panel-heading"><div><span className="eyebrow">AUDITABLE RECORDS</span><h2>Recent sample history</h2></div><button className="text-button" onClick={() => onInspect(latest?.sample_id || '')} disabled={!latest}>Analyse latest <ChevronDown size={14} /></button></div>{samples.length ? <SampleTable samples={samples.slice(0, 5)} onInspect={onInspect} /> : <div className="table-empty">No records returned by the backend.</div>}</section><ScientificNotice /></>
}

function LiveAnalysis({ token, region, transport, onComplete }: { token: string; region: Region; transport?: string; onComplete: () => void }) {
  const [device, setDevice] = useState<Device | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [phase, setPhase] = useState<'loading' | 'idle' | 'starting' | 'sensing' | 'reading' | 'completing' | 'complete' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    request<Device>('/devices', undefined, token)
      .then(result => { setDevice(result); setPhase('idle') })
      .catch(error => { setError(errorMessage(error, 'Device status is unavailable.')); setPhase('idle') })
  }, [token])

  async function startAnalysis() {
    setPhase('starting')
    setError('')
    try {
      const connected = device?.status === 'connected' ? device : await request<Device>('/devices/connect', { method: 'POST' }, token)
      setDevice(connected)
      const started = await request<Analysis>('/analysis/start', { method: 'POST', body: JSON.stringify({ state_code: region.stateCode, state_name: region.stateName, district_name: region.districtName, source_type: 'other' }) }, token)
      setAnalysis(started)
      setReadings([])
      setPhase('sensing')
    } catch (error) {
      setError(errorMessage(error, 'Could not start sensor analysis.'))
      setPhase('error')
    }
  }

  useEffect(() => {
    if (phase !== 'sensing' || !analysis) return
    let active = true
    const checkStability = (list: Reading[]) => {
      if (list.length < 3) return false
      const last3 = list.slice(-3)
      const phs = last3.map(r => r.ph), tds = last3.map(r => r.tds_mgl), tur = last3.map(r => r.turbidity_ntu), tmp = last3.map(r => r.temp_c)
      const phOk = (Math.max(...phs) - Math.min(...phs)) <= 0.05
      const tdsOk = (Math.max(...tds) - Math.min(...tds)) <= 1.0
      const turOk = (Math.max(...tur) - Math.min(...tur)) <= 0.5
      const tmpOk = (Math.max(...tmp) - Math.min(...tmp)) <= 0.2
      const stableCount = (phOk ? 1 : 0) + (tdsOk ? 1 : 0) + (turOk ? 1 : 0) + (tmpOk ? 1 : 0)
      return stableCount >= 3
    }

    const streamReadings = async () => {
      while (active) {
        try {
          const reading = await request<Reading>(`/analysis/${encodeURIComponent(analysis.id)}/reading`, { method: 'POST' }, token)
          if (active) {
            setReadings(prev => {
              const next = [...prev, reading]
              if (checkStability(next)) {
                setTimeout(() => { if (active) completeAnalysis() }, 100)
              }
              return next
            })
          }
        } catch (err) {
          if (active) {
            await new Promise(r => setTimeout(r, 1000))
          }
        }
      }
    }
    streamReadings()
    return () => { active = false }
  }, [phase, analysis, token])

  async function readSensor() {
    if (!analysis) return
    setPhase('reading')
    setError('')
    try {
      const reading = await request<Reading>(`/analysis/${encodeURIComponent(analysis.id)}/reading`, { method: 'POST' }, token)
      setReadings(current => [...current, reading])
      setPhase('sensing')
    } catch (error) {
      setError(errorMessage(error, 'No valid sensor reading was returned.'))
      setPhase('sensing')
    }
  }

  async function completeAnalysis() {
    if (!analysis) return
    setPhase('completing')
    setError('')
    try {
      const completed = await request<Analysis>(`/analysis/${encodeURIComponent(analysis.id)}/complete`, { method: 'POST' }, token)
      setAnalysis(completed)
      setPhase('complete')
      onComplete()
    } catch (error) {
      setError(errorMessage(error, 'Could not complete sensor analysis.'))
      setPhase('sensing')
    }
  }

  async function disconnect() {
    setError('')
    try { setDevice(await request<Device>('/devices/disconnect', { method: 'POST' }, token)) }
    catch (error) { setError(errorMessage(error, 'Could not disconnect the device.')) }
  }

  const active = phase === 'sensing' || phase === 'reading'
  const latestReading = readings[readings.length - 1]

  return <section className="live-analysis panel"><div className="panel-heading"><div><span className="eyebrow">LIVE CAPTURE</span><h2>Read from a connected device</h2><p className="section-description">Values below stream live from your hardware and auto-complete when readings stabilize.</p></div><span className="record-count">{transport || 'Transport not reported'}</span></div><div className="live-analysis-body">{error && <div className="error-box" role="alert">{error}</div>}{phase === 'loading' ? <LoadingState label="Checking device availability…" /> : <><div className="live-device-status"><span className={`status-pill ${device?.status === 'connected' ? 'reported' : ''}`}><span />{device?.status || 'Device status unavailable'}</span>{device?.id && <small>Device {device.id}</small>}{device?.hello?.version && <small>Firmware {device.hello.version}</small>}</div>{latestReading && phase !== 'complete' && <div className="sensor-grid live-grid" style={{ marginTop: 12, marginBottom: 16 }}><article className="sensor-card live-card"><span>pH <span className="live-dot" style={{ background: '#22c55e', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 4 }} /></span><strong>{latestReading.ph.toFixed(2)}</strong><em>Live stream · #{latestReading.sequence}</em></article><article className="sensor-card live-card"><span>TDS <span className="live-dot" style={{ background: '#22c55e', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 4 }} /></span><strong>{latestReading.tds_mgl.toFixed(1)} <small>mg/L</small></strong><em>Live stream · #{latestReading.sequence}</em></article><article className="sensor-card live-card"><span>Turbidity <span className="live-dot" style={{ background: '#22c55e', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 4 }} /></span><strong>{latestReading.turbidity_ntu.toFixed(1)} <small>NTU</small></strong><em>Live stream · #{latestReading.sequence}</em></article><article className="sensor-card live-card"><span>Temperature <span className="live-dot" style={{ background: '#22c55e', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 4 }} /></span><strong>{latestReading.temp_c.toFixed(1)} <small>°C</small></strong><em>Live stream · #{latestReading.sequence}</em></article></div>}{phase === 'complete' ? <div className="capture-complete"><Check size={20} /><div><b>Analysis complete (Stabilized)</b><p>{analysis?.reading_count ?? readings.length} reading(s) captured and saved. The stored result is updated below.</p></div></div> : <div className="capture-actions"><button className="primary-button" onClick={startAnalysis} disabled={phase === 'starting' || active || phase === 'completing'}>{phase === 'starting' ? 'Connecting…' : analysis ? 'Restart analysis' : 'Start sensor analysis'} <ArrowRight size={16} /></button>{analysis && <><span className="status-pill reported" style={{ alignSelf: 'center', fontSize: '0.85rem' }}><span style={{ animation: 'pulse 1s infinite' }} />{readings.length < 10 ? `Sampling (${readings.length}/10 min needed)` : 'Stabilizing live values…'}</span><button className="secondary-button" onClick={completeAnalysis} disabled={phase !== 'sensing'}>{phase === 'completing' ? 'Saving…' : 'Save & Complete now'} <Check size={15} /></button></>}{device?.status === 'connected' && <button className="text-button" onClick={disconnect} disabled={active}>Disconnect device</button>}</div>}{readings.length > 0 && <div className="reading-list"><b>{readings.length} reading(s) returned</b><div className="reading-grid">{readings.map(reading => <div className="reading-row" key={reading.sequence}><span>#{reading.sequence}</span><span>pH {reading.ph}</span><span>TDS {reading.tds_mgl} mg/L</span><span>Turbidity {reading.turbidity_ntu} NTU</span><span>{reading.temp_c} °C</span></div>)}</div></div>}</>}</div></section>
}

function AnalyseWater({ samples, selectedSample, selectedSampleId, setSelectedSampleId, status, onRetry }: {  samples: Sample[]; selectedSample?: Sample; selectedSampleId: string; setSelectedSampleId: (id: string) => void; status: DashboardStatus; onRetry: () => void }) {
  return <><div className="section-heading tab-heading"><div><span className="eyebrow">ANALYSE WATER</span><h2>Inspect a stored measurement</h2><p className="section-description">Analysis uses completed, non-synthetic records returned by <code>GET /samples</code>.</p></div>{samples.length > 0 && <label className="sample-picker">Sample<select value={selectedSampleId} onChange={e => setSelectedSampleId(e.target.value)}>{samples.map(sample => <option key={sample.sample_id} value={sample.sample_id}>{sample.sample_id}</option>)}</select></label>}</div>{status === 'loading' && !samples.length ? <LoadingState label="Loading measurements for analysis…" /> : !selectedSample ? status === 'error' ? <ErrorState title="Analysis data could not be loaded" onRetry={onRetry} /> : <EmptyState icon={<Beaker size={24} />} title="No stored measurements to analyse" description="A real sample returned by the backend will appear here. This view does not create sensor readings." /> : <><section className="analysis-summary"><div><span className="eyebrow">STORED SAMPLE</span><h3>{selectedSample.sample_id}</h3><p>{locationFor(selectedSample)} · {formatDate(selectedSample.measured_at)}</p></div><span className={`verdict ${verdictClass(selectedSample.verdict?.state)}`}>{selectedSample.verdict?.state || 'UNKNOWN'}</span></section><section className="sensor-grid analysis-grid"><MeasurementCards sample={selectedSample} /></section><section className="panel details-panel"><div className="panel-heading"><div><span className="eyebrow">INTERPRETATION</span><h2>Backend verdict details</h2></div></div>{selectedSample.verdict?.reasons?.length ? <ul className="reason-list">{selectedSample.verdict.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p className="panel-copy">No verdict reasons were included with this stored record.</p>}</section></>}<ScientificNotice /></>
}

function SampleHistory({ samples, loadedCount, total, pageOffset, onPageChange, search, setSearch, status, onRetry, onInspect }: { samples: Sample[]; loadedCount: number; total: number; pageOffset: number; onPageChange: (offset: number) => void; search: string; setSearch: (value: string) => void; status: DashboardStatus; onRetry: () => void; onInspect: (sampleId: string) => void }) {
  const hasLoaded = status !== 'loading' || samples.length > 0
  return <><div className="section-heading tab-heading"><div><span className="eyebrow">AUDITABLE RECORDS</span><h2>Sample history</h2><p className="section-description">Showing backend records only. Search filters this page of returned records. Region-based access must be enforced by the backend.</p></div><span className="record-count">{loadedCount} loaded / {total} available</span></div><section className="panel history-panel"><div className="panel-heading"><div><span className="eyebrow">MEASUREMENTS</span><h2>{search ? `${samples.length} matching records` : 'Stored samples'}</h2></div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sample ID or location" aria-label="Search sample history" /></div>{!hasLoaded ? <LoadingState label="Loading sample history…" /> : status === 'error' && !samples.length ? <ErrorState title="Sample history could not be loaded" onRetry={onRetry} /> : samples.length ? <SampleTable samples={samples} onInspect={onInspect} /> : <div className="table-empty">{search ? 'No matching records returned by the backend.' : 'The backend returned no real sample records.'}</div>}<div className="pagination"><span>{total ? `${pageOffset + 1}–${Math.min(pageOffset + loadedCount, total)} of ${total}` : '0 records'}</span><div><button className="secondary-button" disabled={status === 'loading' || pageOffset === 0} onClick={() => onPageChange(Math.max(0, pageOffset - 50))}>Previous</button><button className="secondary-button" disabled={status === 'loading' || pageOffset + 50 >= total} onClick={() => onPageChange(pageOffset + 50)}>Next</button></div></div></section><ScientificNotice /></>
}

function Devices({ token, health, status, onRetry }: { token: string; health: Health | null; status: DashboardStatus; onRetry: () => void }) {
  const [device, setDevice] = useState<Device | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<DashboardStatus>('loading')
  const [error, setError] = useState('')
  async function loadDevice() {
    setDeviceStatus('loading')
    setError('')
    try { setDevice(await request<Device>('/devices', undefined, token)); setDeviceStatus('ready') }
    catch (error) { setError(errorMessage(error, 'Device inventory is unavailable.')); setDeviceStatus('error') }
  }
  useEffect(() => { loadDevice() }, [token])
  return <><div className="section-heading tab-heading"><div><span className="eyebrow">DEVICE STATUS</span><h2>Connection and backend health</h2><p className="section-description">Health comes from <code>GET /health</code>; device details come from <code>GET /devices</code>.</p></div><span className={`status-pill ${health ? 'reported' : ''}`}><span />{health ? 'Status reported' : 'Status unavailable'}</span></div>{status === 'loading' && !health ? <LoadingState label="Loading system status…" /> : !health ? <ErrorState title="System status could not be loaded" onRetry={onRetry} /> : <section className="device-grid"><DeviceCard label="Device status" value={health.device_status} detail="Reported by backend health" /><DeviceCard label="Transport" value={health.transport} detail="Configured connection mode" /><DeviceCard label="Database" value={health.db} detail="Backend storage status" /><DeviceCard label="Server time" value={formatDate(health.server_time)} detail={health.version ? `API version ${health.version}` : 'Reported by backend'} /></section>}{error && <div className="error-box" role="alert">{error}</div>}{deviceStatus === 'loading' ? <LoadingState label="Loading device details…" /> : device ? <section className="panel device-details"><div className="panel-heading"><div><span className="eyebrow">DEVICE INVENTORY</span><h2>{device.id}</h2></div><button className="secondary-button" onClick={loadDevice}>Refresh device</button></div><div className="device-detail-grid"><DeviceCard label="Connection" value={device.status} detail="Current device manager state" /><DeviceCard label="Port" value={device.port || 'Not reported'} detail={device.baud ? `${device.baud} baud` : 'No baud rate reported'} /><DeviceCard label="Firmware" value={device.hello?.version || 'Not reported'} detail={device.hello?.device || 'No HELLO response'} /><DeviceCard label="Last seen" value={device.last_seen ? formatDate(device.last_seen) : 'Not reported'} detail="Backend device metadata" /></div></section> : deviceStatus === 'error' && <section className="availability-note"><Database size={19} /><div><b>No device details are available.</b><p>The health endpoint still reports aggregate backend status, but the device inventory request failed. No identity or battery values are shown as placeholders.</p></div></section>}<ScientificNotice /></>
}

function MeasurementCards({ sample }: { sample: Sample }) {
  return <>{labels.map(([key, label, unit]) => <article className="sensor-card" key={key}><span>{label}</span><strong>{sample.final_values?.[key] ?? '—'} <small>{unit}</small></strong><em>Stored measurement · {sample.sample_id}</em></article>)}</>
}

function SampleTable({ samples, onInspect }: { samples: Sample[]; onInspect: (sampleId: string) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Sample ID</th><th>Location</th><th>Measured</th><th>Verdict</th><th><span className="visually-hidden">Action</span></th></tr></thead><tbody>{samples.map(sample => <tr key={sample.sample_id}><td className="mono">{sample.sample_id}</td><td>{locationFor(sample)}</td><td>{formatDate(sample.measured_at)}</td><td><span className={`verdict ${verdictClass(sample.verdict?.state)}`}>{sample.verdict?.state || 'UNKNOWN'}</span></td><td><button className="row-action" onClick={() => onInspect(sample.sample_id)}>Inspect</button></td></tr>)}</tbody></table></div>
}

function LoadingState({ label }: { label: string }) { return <section className="empty-state loading-state"><RefreshCw size={24} className="spin" /><h3>{label}</h3><p>Waiting for the backend response.</p></section> }
function ErrorState({ title, onRetry }: { title: string; onRetry: () => void }) { return <section className="empty-state error-state"><CircleAlert size={24} /><h3>{title}</h3><p>Check the API connection and try again.</p><button className="secondary-button" onClick={onRetry}>Retry <RefreshCw size={14} /></button></section> }
function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) { return <section className="empty-state">{icon}<h3>{title}</h3><p>{description}</p></section> }
function DeviceCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="device-card"><span>{label}</span><strong>{value || 'Not reported'}</strong><small>{detail}</small></article> }
function Kpi({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <article className="kpi"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article> }
function ScientificNotice() { return null }

createRoot(document.getElementById('root')!).render(<App />)
