import React, {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import './styles.css'

const labels = {
  ph: ['pH', ''],
  tds_mgl: ['TDS', 'mg/L'],
  turbidity_ntu: ['Turbidity', 'NTU'],
  temp_c: ['Temperature', '°C']
}

async function api(path) {
  const response = await fetch(`/api/v1${path}`, {cache: 'no-store'})
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error?.message || `API request failed (${response.status})`)
  }
  return response.json()
}

function App() {
  const [page, setPage] = useState('Overview')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  
  // Geography state
  const [state, setState] = useState('JH')
  const [districts, setDistricts] = useState([])
  const [districtError, setDistrictError] = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [enteredLocation, setEnteredLocation] = useState(null)

  // Samples & Search
  const [search, setSearch] = useState('')

  // Auth / Login Modal state
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [user, setUser] = useState(null)
  const [loginForm, setLoginForm] = useState({username: '', password: ''})
  const [loginError, setLoginError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [health, samples, states] = await Promise.all([
        api('/health'),
        api('/samples'),
        api('/meta/states')
      ])
      if (!Array.isArray(samples.items) || !Array.isArray(states.items)) {
        throw new Error('Invalid API response')
      }
      setData({
        health,
        samples: {...samples, items: samples.items.filter(s => s.synthetic === false)},
        states: states.items
      })
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    let current = true
    setDistricts([])
    setDistrictError('')
    api(`/meta/states/${encodeURIComponent(state)}/districts`)
      .then(result => {
        if (current) {
          setDistricts(result.items || [])
          if (result.items && result.items.length > 0) {
            setSelectedDistrict(result.items[0].name)
          } else {
            setSelectedDistrict('')
          }
        }
      })
      .catch(e => {
        if (current) setDistrictError(e.message)
      })
    return () => { current = false }
  }, [state])

  const samples = data?.samples.items || []
  const latest = samples[0]
  const visible = samples.filter(s =>
    `${s.sample_id} ${s.region?.location_text || ''} ${s.region?.district_name || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  function exportCSV() {
    const columns = ['sample_id', 'measured_at', 'ph', 'tds_mgl', 'turbidity_ntu', 'temp_c', 'synthetic']
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`
    const text = [
      columns,
      ...visible.map(s => [
        s.sample_id,
        s.measured_at,
        ...Object.keys(labels).map(k => s.final_values?.[k]),
        false
      ])
    ].map(row => row.map(quote).join(',')).join('\r\n')
    
    const url = URL.createObjectURL(new Blob([text], {type: 'text/csv'}))
    const a = document.createElement('a')
    a.href = url
    a.download = 'jalraksha-real-samples.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleSelectGeography(districtName) {
    const stateObj = data?.states?.find(s => s.code === state)
    const stateName = stateObj ? stateObj.name : state
    const dName = districtName || selectedDistrict
    if (!dName) return
    setEnteredLocation({state: stateName, stateCode: state, district: dName})
    // As soon as we enter the geography, prompt login if not authenticated
    if (!user) {
      setShowLoginModal(true)
    }
  }

  function handleLoginSubmit(e) {
    e.preventDefault()
    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      setLoginError('Please provide both username and password.')
      return
    }
    // Set user session in state
    setUser({
      username: loginForm.username.trim(),
      role: 'Officer / Operator'
    })
    setShowLoginModal(false)
    setLoginForm({username: '', password: ''})
    setLoginError('')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">◈</div>
          <div>
            <b>jalraksha</b>
            <small>water intelligence</small>
          </div>
        </div>
        <span className="side-label">WORKSPACE</span>
        {['Overview', 'Samples & history', 'Device', 'Geography'].map(item => (
          <button
            key={item}
            className={`nav-item ${page === item ? 'active' : ''}`}
            onClick={() => setPage(item)}
          >
            {item}
          </button>
        ))}
        <div className="side-bottom">
          {user ? (
            <div>
              <p style={{margin: '0 0 2px', fontWeight: '700', color: 'var(--teal)'}}>● {user.username}</p>
              <small>{user.role}</small>
              <button
                className="btn"
                style={{marginTop: '10px', width: '100%', padding: '6px', fontSize: '11px'}}
                onClick={() => setUser(null)}
              >
                Log out
              </button>
            </div>
          ) : (
            <div>
              <p>Live API connection</p>
              <small>No demo data · no simulated readings</small>
              <button
                className="btn primary"
                style={{marginTop: '10px', width: '100%', padding: '6px', fontSize: '11px'}}
                onClick={() => setShowLoginModal(true)}
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="crumb">
            Workspace / <strong>{page}</strong>
            {enteredLocation && (
              <span className="location-pill">
                📍 {enteredLocation.district}, {enteredLocation.state}
              </span>
            )}
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
            <span>{loading ? 'Connecting…' : error ? 'API unavailable' : 'API connected'}</span>
            {user ? (
              <span className="user-badge">{user.username}</span>
            ) : (
              <button className="btn" onClick={() => setShowLoginModal(true)}>Log in</button>
            )}
          </div>
        </header>

        <div className="content">
          <div className="page-header">
            <div>
              <span className="eyebrow">JALRAKSHA · REAL RECORDS ONLY</span>
              <h1>{page === 'Overview' ? 'Water quality monitoring' : page}</h1>
              <p>Measurements from the backend, without fabricated data.</p>
            </div>
            <button className="btn primary" disabled={loading} onClick={refresh}>
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>

          {error && (
            <div className="panel" role="alert">
              <h2>Backend unavailable</h2>
              <p>{error}. Ensure the FastAPI server is running on port 8000.</p>
            </div>
          )}

          {!error && !loading && data && (
            <>
              {page === 'Overview' && (
                <>
                  {/* Geography selector right on the Homepage */}
                  <div className="panel geography-home-panel">
                    <div className="geo-header">
                      <div>
                        <h2>Region & Geography Selection</h2>
                        <p>Select your jurisdiction or deployment location to begin monitoring and enter testing sessions.</p>
                      </div>
                      {enteredLocation ? (
                        <div className="geo-active-tag">
                          Active: <strong>{enteredLocation.district}, {enteredLocation.state}</strong>
                        </div>
                      ) : (
                        <span className="label" style={{color: 'var(--teal)'}}>Select region below</span>
                      )}
                    </div>

                    <div className="geo-controls">
                      <label className="geo-field">
                        <span>State</span>
                        <select value={state} onChange={e => setState(e.target.value)}>
                          {data.states.map(s => (
                            <option value={s.code} key={s.code}>{s.name}</option>
                          ))}
                        </select>
                      </label>

                      <label className="geo-field">
                        <span>District</span>
                        <select
                          value={selectedDistrict}
                          onChange={e => setSelectedDistrict(e.target.value)}
                          disabled={!districts.length}
                        >
                          {districts.map((d, i) => (
                            <option value={d.name} key={`${d.name}-${i}`}>{d.name}</option>
                          ))}
                        </select>
                      </label>

                      <button
                        className="btn primary enter-geo-btn"
                        onClick={() => handleSelectGeography(selectedDistrict)}
                        disabled={!selectedDistrict}
                      >
                        Enter Geography & Login →
                      </button>
                    </div>

                    {districtError && <p role="alert" style={{color: '#c93b2b', marginTop: '10px'}}>{districtError}</p>}
                  </div>

                  <section className="hero-grid">
                    <div className="network-card">
                      <span className="label">REAL SAMPLES IN DATABASE</span>
                      <div className="network-number">{data.samples.total}</div>
                      <p>Synthetic records are excluded.</p>
                    </div>
                    <div className="quick-card">
                      <span className="label">DEVICE STATUS</span>
                      <h2>{data.health.device_status}</h2>
                      <p>Configured transport: {data.health.transport}. Configuration does not mean a device is connected.</p>
                    </div>
                  </section>

                  <div className="section-title">
                    <div>
                      <h2>Latest stored measurement</h2>
                      <p>{latest ? `${latest.sample_id} · ${new Date(latest.measured_at).toLocaleString()}` : 'No real measurements have been recorded.'}</p>
                    </div>
                  </div>

                  <section className="sensor-grid">
                    {Object.entries(labels).map(([key, [name, unit]]) => (
                      <article className="sensor-card" key={key}>
                        <span className="sensor-name">{name}</span>
                        <div className="sensor-value">
                          {latest?.final_values?.[key] ?? '—'}
                          <small>{unit}</small>
                        </div>
                        <p className="muted">{latest ? 'Stored measurement · not a live reading' : 'Waiting for real data'}</p>
                      </article>
                    ))}
                  </section>

                  <div className="panel">
                    <h2>Measurement limitations</h2>
                    <p>These sensors cannot detect fluoride, arsenic, iron, nitrate or bacteria. A field-kit or lab test is recommended.</p>
                    {latest?.verdict && (
                      <>
                        <h3>Recorded verdict: {latest.verdict.state}</h3>
                        {latest.verdict.reasons?.map((r, i) => (
                          <p key={i}>{r}</p>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}

              {page === 'Samples & history' && (
                <>
                  <div className="filters">
                    <div className="search">
                      <input
                        aria-label="Search loaded samples"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search loaded samples"
                      />
                    </div>
                    <button onClick={exportCSV} disabled={!visible.length}>Export displayed CSV</button>
                  </div>
                  <section className="panel">
                    <h2>{data.samples.total} real samples</h2>
                    <p>Showing up to the latest 50 records. Synthetic records excluded.</p>
                    {visible.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Sample ID</th>
                              <th>Location</th>
                              <th>Measured</th>
                              <th>Verdict</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map(s => (
                              <tr key={s.sample_id}>
                                <td>{s.sample_id}</td>
                                <td>{s.region?.location_text || s.region?.district_name || '—'}</td>
                                <td>{new Date(s.measured_at).toLocaleString()}</td>
                                <td>{s.verdict?.state || 'UNKNOWN'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>No matching real samples. Nothing has been generated or seeded.</p>
                    )}
                  </section>
                </>
              )}

              {page === 'Device' && (
                <section className="panel">
                  <h2>Device: {data.health.device_status}</h2>
                  <p>Configured transport: {data.health.transport}</p>
                  <p>Database: {data.health.db}</p>
                  <p>Backend time: {data.health.server_time}</p>
                  <p>The backend currently has no connected acquisition service. Starting measurements is disabled until the real serial/session implementation is connected. No simulator output is shown.</p>
                </section>
              )}

              {page === 'Geography' && (
                <section className="panel">
                  <h2>Supported geography</h2>
                  <div style={{display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px'}}>
                    <label>
                      State{' '}
                      <select value={state} onChange={e => setState(e.target.value)}>
                        {data.states.map(s => (
                          <option value={s.code} key={s.code}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn primary"
                      onClick={() => handleSelectGeography(districts[0]?.name)}
                      disabled={!districts.length}
                    >
                      Set as Active Geography
                    </button>
                  </div>
                  {districtError ? (
                    <p role="alert">{districtError}</p>
                  ) : (
                    <ul className="district-list">
                      {districts.map((d, i) => (
                        <li key={`${d.name}-${i}`}>
                          <button
                            className="district-btn"
                            onClick={() => handleSelectGeography(d.name)}
                          >
                            {d.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p style={{marginTop: '20px'}}>District names come from backend metadata. No invented blocks or villages are displayed.</p>
                </section>
              )}
            </>
          )}

          {loading && <p role="status">Loading backend records…</p>}
        </div>
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="backdrop" onClick={() => setShowLoginModal(false)}>
          <div className="login-modal" onClick={e => e.stopPropagation()}>
            <div className="login-modal-header">
              <div className="brand-mark" style={{margin: '0 auto 12px'}}>◈</div>
              <h2>Authenticate Operator</h2>
              <p>
                {enteredLocation
                  ? `Entering geography: ${enteredLocation.district}, ${enteredLocation.state}`
                  : 'Log in to access device controls and records'}
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} className="login-form">
              {loginError && <div className="login-error-msg">{loginError}</div>}
              <div className="form-group">
                <label>Username / Officer ID</label>
                <input
                  type="text"
                  placeholder="e.g. jal_operator_01"
                  value={loginForm.username}
                  onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Password / Access Key</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                  required
                />
              </div>

              <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                <button type="submit" className="btn primary" style={{flex: 1, padding: '12px'}}>
                  Sign In
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{padding: '12px'}}
                  onClick={() => setShowLoginModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App/>)
