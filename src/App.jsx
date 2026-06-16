import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import './App.css'
import supabase from './supabase'
const QUESTION_TIME = 60

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getBadgeClass(lang) {
  if (!lang) return 'badge-js'
  const l = lang.toLowerCase()
  if (l.includes('python')) return 'badge-py'
  if (l.includes('html') || l.includes('css')) return 'badge-html'
  return 'badge-js'
}

function getBadgeLabel(lang) {
  if (!lang) return 'JS'
  const l = lang.toLowerCase()
  if (l.includes('python')) return 'Python'
  if (l.includes('html') || l.includes('css')) return 'HTML/CSS'
  return 'JavaScript'
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
        </Routes>
      </Layout>
    </Router>
  )
}

function Layout({ children }) {
  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-logo">
          <a href="/" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
            <div className="nav-icon">{'</>'}</div>
            <div className="nav-title">KDU <span>//</span> NACOS<br /><span style={{fontSize:'10px',letterSpacing:'0.15em'}}>DEBUG CHALLENGE</span></div>
          </a>
        </div>
        <div className="nav-status">
          <a href="/leaderboard" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="status-dot" />
              session://live
            </div>
          </a>
        </div>
      </nav>
      {children}
    </div>
  )
}

function Home() {
  const [screen, setScreen] = useState('entry') // entry, quiz, results, leaderboard
  const [participant, setParticipant] = useState(null)
  const [questions, setQuestions] = useState([])
  const [session, setSession] = useState(null)

  return (
    <>
      {screen === 'entry' && (
        <EntryScreen onStart={(p, q) => { setParticipant(p); setQuestions(q); setScreen('quiz') }} />
      )}
      {screen === 'quiz' && (
        <QuizScreen
          participant={participant}
          questions={questions}
          onDone={(s) => { setSession(s); setScreen('results') }}
        />
      )}
      {screen === 'results' && (
        <ResultsScreen
          session={session}
          onLeaderboard={() => setScreen('leaderboard')}
          onRestart={() => setScreen('entry')}
        />
      )}
      {screen === 'leaderboard' && (
        <div className="screen">
          <LeaderboardScreen
            participantId={session?.id}
            onRestart={() => setScreen('entry')}
          />
        </div>
      )}
    </>
  )
}

function LeaderboardPage() {
  return (
    <div className="screen">
      <LeaderboardScreen participantId={null} onRestart={() => window.location.href = '/'} />
    </div>
  )
}

// ── ENTRY ────────────────────────────────────────────────────────────────────
function EntryScreen({ onStart }) {
  const [name, setName] = useState('')
  const [matric, setMatric] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

async function handleStart() {
  if (!name.trim() || !matric.trim()) { setError('Please fill in both fields.'); return }
  setLoading(true); setError('')
  try {
    // Check if matric already participated
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('matric', matric.trim().toUpperCase())
      .single()

    if (existing) {
      setError('This matric number has already participated. Only one attempt is allowed.')
      setLoading(false)
      return
    }

    const { data, error: qErr } = await supabase.from('questions').select('*')
    if (qErr) throw qErr
    if (!data || data.length === 0) throw new Error('No questions found. Please seed the database.')
    const selected = shuffle(data).slice(0, 20)
    onStart({ name: name.trim(), matric: matric.trim().toUpperCase() }, selected)
  } catch (e) {
    if (e.message?.includes('already participated')) {
      setError(e.message)
    } else {
      setError(e.message || 'Failed to load questions.')
    }
    setLoading(false)
  }
}

  return (
    <div className="screen">
      <div className="entry-wrap">
        <h1 className="entry-title"><span className="accent">&lt;Debug/&gt;</span> The Challenge</h1>
        <p className="entry-sub">20 broken snippets · 60s each · Python / JS / HTML+CSS</p>
        <p className="entry-sub">Powered by NACOS — Koladaisi University</p>

        <div className="entry-card">
          <div className="entry-card-label">// participant.register()</div>

          <div className="field">
            <label>FULL_NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ada Lovelace" />
          </div>
          <div className="field">
            <label>MATRIC_NUMBER</label>
            <input value={matric} onChange={e => setMatric(e.target.value)} placeholder="e.g. KDU/CS/22/0001"
              onKeyDown={e => e.key === 'Enter' && handleStart()} />
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '1rem' }}>{error}</p>}

          <button className="btn-start" onClick={handleStart} disabled={loading}>
            {loading ? 'LOADING_QUESTIONS...' : 'START_CHALLENGE →'}
          </button>
        </div>

        <p className="entry-scoring">Scoring: +10 correct · +5 if under 60s · max 300</p>
      </div>
    </div>
  )
}

// ── QUIZ ─────────────────────────────────────────────────────────────────────
function QuizScreen({ participant, questions, onDone }) {
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME)
  const [results, setResults] = useState([]) // {correct, fast, time}
  const [submitted, setSubmitted] = useState(false) // prevent duplicate submissions
  const timerRef = useRef(null)
  const startRef = useRef(Date.now())

  const q = questions[idx]

  const advance = useCallback((chosenIdx) => {
    clearInterval(timerRef.current)
    const elapsed = Math.round((Date.now() - startRef.current) / 1000)
    
    // Normalize answer to number (0-3) for comparison
    const answerIdx = typeof q.correct_answer === 'string' 
      ? (q.correct_answer === 'A' || q.correct_answer === 'a' ? 0 : 
         q.correct_answer === 'B' || q.correct_answer === 'b' ? 1 : 
         q.correct_answer === 'C' || q.correct_answer === 'c' ? 2 : 
         q.correct_answer === 'D' || q.correct_answer === 'd' ? 3 : 
         parseInt(q.correct_answer, 10))
      : q.correct_answer
    
    const correct = chosenIdx === answerIdx
    const fast = elapsed < QUESTION_TIME && chosenIdx !== null
    const newResults = [...results, { correct, fast, time: elapsed }]
    
    // Debug log (remove after testing)
    console.log(`Q${idx + 1}: chose=${chosenIdx}, answer=${q.correct_answer} (normalized=${answerIdx}), correct=${correct}`)

    if (idx < questions.length - 1) {
      setResults(newResults)
      setSelected(chosenIdx)
      setTimeout(() => {
        setIdx(i => i + 1)
        setSelected(null)
        setTimeLeft(QUESTION_TIME)
        startRef.current = Date.now()
      }, 800)
    } else {
      // done
      finishQuiz(newResults)
    }
  }, [idx, q, results, questions.length])

  async function finishQuiz(allResults) {
    // Prevent duplicate submissions
    if (submitted) {
      console.warn('Quiz already submitted, ignoring duplicate call')
      return
    }
    setSubmitted(true)

    const score = allResults.reduce((acc, r) => acc + (r.correct ? 10 : 0) + (r.correct && r.fast ? 5 : 0), 0)
    const correct = allResults.filter(r => r.correct).length
    const fast = allResults.filter(r => r.correct && r.fast).length
    const totalTime = allResults.reduce((acc, r) => acc + r.time, 0)

    try {
      console.log('Saving participant:', {
        name: participant.name,
        matric: participant.matric,
        score,
        total_time_seconds: totalTime,
        fast_answers: fast,
        correct_answers: correct
      })

      const { data, error } = await supabase.from('participants').insert({
        name: participant.name,
        matric: participant.matric,
        score,
        total_time_seconds: totalTime,
        fast_answers: fast,
        correct_answers: correct
      }).select().single()

      if (error) {
        console.error('Error saving participant:', error)
        alert('Error saving score: ' + error.message)
        setSubmitted(false) // allow retry on error
        return
      }

      console.log('Participant saved:', data)
      onDone({ score, correct, fast, totalTime, id: data?.id })
    } catch (e) {
      console.error('Exception saving participant:', e)
      alert('Unexpected error: ' + e.message)
      setSubmitted(false) // allow retry on error
    }
  }

  useEffect(() => {
    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); advance(null); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [idx])

  const options = [q.option_a, q.option_b, q.option_c, q.option_d]
  const pct = (timeLeft / QUESTION_TIME) * 100
  const warn = timeLeft <= 10

  return (
    <div className="screen">
      <div className="quiz-wrap">
        <div className="quiz-header">
          <span className="quiz-progress-text">Question <strong>{idx + 1}</strong> / {questions.length}</span>
          <span className={`badge ${getBadgeClass(q.language)}`}>{getBadgeLabel(q.language)}</span>
        </div>

        <div className={`timer-label ${warn ? 'warn' : ''}`}>{timeLeft}s remaining</div>
        <div className="timer-bar-wrap">
          <div className={`timer-bar ${warn ? 'warn' : ''}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="quiz-card">
          <p className="quiz-question">{q.question}</p>
          {q.code && <pre className="code-block">{q.code}</pre>}

          <div className="options">
            {options.map((opt, i) => {
              // Normalize answer to number for comparison
              const answerIdx = typeof q.correct_answer === 'string' 
                ? (q.correct_answer === 'A' || q.correct_answer === 'a' ? 0 : 
                   q.correct_answer === 'B' || q.correct_answer === 'b' ? 1 : 
                   q.correct_answer === 'C' || q.correct_answer === 'c' ? 2 : 
                   q.correct_answer === 'D' || q.correct_answer === 'd' ? 3 : 
                   parseInt(q.correct_answer, 10))
                : q.correct_answer
              
              let cls = 'option-btn'
              if (selected !== null) {
                if (i === answerIdx) cls += ' correct'
                else if (i === selected && selected !== answerIdx) cls += ' wrong'
              }
              return (
                <button key={i} className={cls} disabled={selected !== null} onClick={() => advance(i)}>
                  <span className="option-letter">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── RESULTS ──────────────────────────────────────────────────────────────────
function ResultsScreen({ session, onLeaderboard, onRestart }) {
  const { score, correct, fast, totalTime } = session

  return (
    <div className="screen">
      <div className="results-wrap">
        <p style={{ color: 'var(--muted)', fontSize: '12px', letterSpacing: '0.1em' }}>// session.complete()</p>
        <div className="results-score">{score}</div>
        <div className="results-max">out of 300 points</div>

        <div className="results-stats">
          <div className="stat-card">
            <div className="stat-value">{correct}/20</div>
            <div className="stat-label">CORRECT</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fast}</div>
            <div className="stat-label">FAST (&lt;60s)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalTime}s</div>
            <div className="stat-label">TOTAL TIME</div>
          </div>
        </div>

        <button className="btn-lb" onClick={onLeaderboard}>VIEW_LEADERBOARD →</button>
        <button className="btn-again" onClick={onRestart} style={{ marginTop: '1rem' }}>↩ RESTART_CHALLENGE</button>
      </div>
    </div>
  )
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
function LeaderboardScreen({ participantId, onRestart }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetch() {
      try {
        setLoading(true)
        setError(null)
        const { data, error: qErr } = await supabase
          .from('participants')
          .select('id, name, matric, score, total_time_seconds, fast_answers, correct_answers')
          .order('score', { ascending: false })
          .order('total_time_seconds', { ascending: true })
          .limit(10)
        
        if (qErr) {
          console.error('Leaderboard fetch error:', qErr)
          setError(qErr.message || 'Failed to load leaderboard')
          setRows([])
        } else {
          console.log('Leaderboard data:', data)
          setRows(data || [])
        }
      } catch (e) {
        console.error('Leaderboard exception:', e)
        setError(e.message || 'Unexpected error')
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  function rankClass(i) {
    if (i === 0) return 'rank-1'
    if (i === 1) return 'rank-2'
    if (i === 2) return 'rank-3'
    return 'rank-other'
  }

  return (
    <div className="lb-wrap">
      <h2 className="lb-title"><span className="accent">{'</>'}</span> Leaderboard</h2>
      <p className="lb-sub">Top 10 participants · sorted by score, then time</p>

      {loading && (
        <div className="loading">fetching results...</div>
      )}
      
      {error && (
        <div style={{ color: 'var(--red)', marginBottom: '1rem', padding: '1rem', backgroundColor: 'rgba(255,0,0,0.1)', borderRadius: '4px' }}>
          <strong>Error:</strong> {error}
          <br />
          <button onClick={() => window.location.reload()} style={{ marginTop: '0.5rem', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}
      
      {!loading && !error && rows.length === 0 && (
        <div style={{ color: 'var(--muted)', padding: '2rem', textAlign: 'center' }}>
          No participants yet. Be the first to take the challenge!
        </div>
      )}
      
      {!loading && rows.length > 0 && (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>NAME</th>
              <th>MATRIC</th>
              <th>CORRECT</th>
              <th>FAST</th>
              <th>TIME</th>
              <th>SCORE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.id === participantId ? 'me' : ''}>
                <td><span className={`rank-badge ${rankClass(i)}`}>{i + 1}</span></td>
                <td>{r.name}{r.id === participantId ? ' ◀ you' : ''}</td>
                <td style={{ color: 'var(--muted)' }}>{r.matric}</td>
                <td>{r.correct_answers}/20</td>
                <td>{r.fast_answers}</td>
                <td style={{ color: 'var(--muted)' }}>{r.total_time_seconds}s</td>
                <td className="lb-score">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <br />
      {onRestart && <button className="btn-again" onClick={onRestart}>↩ RESTART_CHALLENGE</button>}
    </div>
  )
}