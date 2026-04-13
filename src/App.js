import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Welcome from './pages/Welcome';
import StreetViewCompare from './components/StreetViewCompare';
import { hasStarted, markStarted } from './lib/participantGuard';

function RestartBlock() {
  return (
    <div style={{ textAlign: "center", paddingTop: "20vh" }}>
      <h2 style={{ color: "red" }}>You cannot restart this study.</h2>
      <p>Please return to Prolific, or contact support if this is an error.</p>
    </div>
  );
}

function GuardedCompare() {
  const params = new URLSearchParams(window.location.search);
  const realPid = params.get("PROLIFIC_PID");

  let pid = realPid;
  if (!pid) {
    const stored = sessionStorage.getItem("dev_prolific_id");
    if (stored) {
      pid = stored;
    } else {
      pid = crypto.randomUUID();
      sessionStorage.setItem("dev_prolific_id", pid);
    }
  }

  // Only enforce guard for real Prolific participants
  if (!realPid) return <StreetViewCompare />;

  if (hasStarted(pid)) return <RestartBlock />;

  markStarted(pid);
  return <StreetViewCompare />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/compare" element={<GuardedCompare />} />
      </Routes>
    </BrowserRouter>
  );
}