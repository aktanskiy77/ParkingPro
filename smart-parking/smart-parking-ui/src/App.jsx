import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8080";

// ── Icons ────────────────────────────────────────────────────────────────────
const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const IconQR = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
    <path d="M14 14h2v2h-2zM18 14h3M14 18h3M20 18v3" />
  </svg>
);
const IconReports = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
    <path d="M3 3v18h18" />
    <path d="M7 16l4-5 4 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
  </svg>
);
const IconCar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
    <path d="M5 11l1.5-4.5h11L19 11" strokeLinecap="round" />
    <rect x="2" y="11" width="20" height="7" rx="2" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </svg>
);
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" strokeLinecap="round" />
  </svg>
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(mins) {
  if (!mins) return "0 мин";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}ч ${m}м` : `${m} мин`;
}

// ── PayModal ─────────────────────────────────────────────────────────────────
function PayModal({ amount, onClose, onPay }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-[400px] rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl"
        style={{ background: "#1a3a6e", borderTop: "2px solid #2a5aac" }}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-6" />
        <p className="text-white/60 text-sm mb-1 text-center">К оплате</p>
        <p className="text-white text-4xl font-bold text-center mb-6">{amount} сом</p>
        <div className="space-y-3">
          {["Mbank QR", "Cash"].map((method) => (
            <button
              key={method}
              onClick={() => onPay(method)}
              className="w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-all active:scale-95"
              style={{ background: method === "Mbank QR" ? "#1a6fd4" : "#0f2e5a", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {method}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState({ status: "Parked", time_minutes: 90, amount: 200, free_spaces: 23, total_spaces: 50 });
  const [history, setHistory] = useState([
    { id: 1, plate: "01 KG 777 TTT", car: "Toyota Camry", entry: "12:47", exit: "13:20", date: "Сег.", paid: true },
    { id: 2, plate: "01 KG 777 TTT", car: "Toyota Camry", entry: "09:10", exit: "11:45", date: "Вчера", paid: true },
  ]);
  const [user] = useState({ name: "Ahmed Tilvaldiev", car: "Toyota Camry", plate: "01 KG 777 TTT", pass: "Wengalbi777" });
  const [showPay, setShowPay] = useState(false);
  const [toast, setToast] = useState(null);

  // Fetch stats from backend
  useEffect(() => {
    fetch(`${API}/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {}); // keep defaults on error
  }, []);

  // Fetch history from backend
  useEffect(() => {
    fetch(`${API}/history`)
      .then((r) => r.json())
      .then((data) => data?.length && setHistory(data))
      .catch(() => {});
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handlePay(method) {
    setShowPay(false);
    showToast(`Оплата через ${method} прошла успешно ✓`);
  }

  const isParked = stats.status?.toLowerCase() === "parked";
  const occupancy = stats.total_spaces
    ? Math.round(((stats.total_spaces - stats.free_spaces) / stats.total_spaces) * 100)
    : 0;

  return (
    <div className="flex justify-center min-h-screen" style={{ background: "#0a1628" }}>
      {/* Mobile shell */}
      <div
        className="relative flex flex-col w-full overflow-hidden"
        style={{ maxWidth: 400, background: "#002347", minHeight: "100dvh" }}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <header
          className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0"
          style={{ background: "#001a38" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl text-white font-black text-lg"
              style={{ background: "#1a6fd4" }}
            >
              P
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Smart</p>
              <p className="text-white/60 text-xs -mt-0.5">Parking</p>
            </div>
          </div>
          <button
            onClick={() => setTab("profile")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all active:scale-95"
            style={{ background: "#0f3060" }}
          >
            <span className="text-white/70 text-xs">Welcome</span>
            <span className="text-white text-xs font-semibold">{user.name.split(" ")[0]}</span>
            <div className="text-white/60">
              <IconUser />
            </div>
          </button>
        </header>

        {/* ── Content ──────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-4 scrollbar-none">
          {tab === "dashboard" && (
            <>
              {/* Spaces bar */}
              <div
                className="rounded-2xl px-4 py-3 flex items-center justify-between"
                style={{ background: "#0f3060" }}
              >
                <span className="text-white/70 text-sm font-medium">Free spaces</span>
                <div className="flex items-center gap-3">
                  <div className="w-28 h-2 rounded-full overflow-hidden" style={{ background: "#001a38" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${occupancy}%`,
                        background: occupancy > 80 ? "#f87171" : "#4ade80",
                      }}
                    />
                  </div>
                  <span
                    className="text-base font-bold"
                    style={{ color: stats.free_spaces === 0 ? "#f87171" : "#4ade80" }}
                  >
                    {stats.free_spaces}/{stats.total_spaces}
                  </span>
                </div>
              </div>

              {/* Status card */}
              <div
                className="rounded-3xl p-5 shadow-xl"
                style={{
                  background: "#0f2e5a",
                  border: `1.5px solid ${isParked ? "#4ade8040" : "#f8717140"}`,
                  boxShadow: isParked ? "0 0 32px #4ade8018" : "0 0 32px #f8717118",
                }}
              >
                {/* Status badge */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white/50 text-xs uppercase tracking-widest font-semibold">Статус</span>
                  <span
                    className="px-4 py-1 rounded-full text-sm font-bold"
                    style={{
                      background: isParked ? "#4ade8020" : "#f8717120",
                      color: isParked ? "#4ade80" : "#f87171",
                      border: `1px solid ${isParked ? "#4ade8060" : "#f8717160"}`,
                    }}
                  >
                    {isParked ? "PARKED" : "UNPARKED"}
                  </span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="rounded-xl p-3" style={{ background: "#001a38" }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-white/40"><IconClock /></span>
                      <span className="text-white/50 text-xs">Время</span>
                    </div>
                    <p className="text-white font-bold text-lg">{fmtTime(stats.time_minutes)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: "#001a38" }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-white/40 text-xs">₸</span>
                      <span className="text-white/50 text-xs">К оплате</span>
                    </div>
                    <p className="text-white font-bold text-lg">{stats.amount} сом</p>
                  </div>
                </div>

                {/* Pay button */}
                {isParked && stats.amount > 0 && (
                  <button
                    onClick={() => setShowPay(true)}
                    className="w-full py-3.5 rounded-2xl text-white font-bold text-base tracking-wide transition-all active:scale-95 shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, #1a6fd4, #0d4fa0)",
                      boxShadow: "0 4px 20px #1a6fd440",
                    }}
                  >
                    Оплатить
                  </button>
                )}
              </div>

              {/* Recent parkings */}
              <div>
                <h2 className="text-white/50 text-xs uppercase tracking-widest font-semibold mb-3 px-1">
                  Recent parkings
                </h2>
                <div className="space-y-2.5">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl px-4 py-3.5 flex items-center justify-between"
                      style={{ background: "#0f2e5a", border: "1px solid #1a4b8230" }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "#001a38" }}
                        >
                          <span className="text-white/60"><IconCar /></span>
                        </div>
                        <div>
                          <p className="text-white font-semibold text-sm">{item.plate}</p>
                          <p className="text-white/40 text-xs">{item.car}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white/80 text-xs">
                          {item.date} {item.entry} → {item.exit}
                        </p>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: item.paid ? "#4ade8015" : "#f8717115",
                            color: item.paid ? "#4ade80" : "#f87171",
                          }}
                        >
                          {item.paid ? "Оплачено" : "Не оплачено"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "qr" && (
            <div className="flex flex-col items-center justify-center h-full gap-6 py-16">
              <div
                className="w-56 h-56 rounded-3xl flex items-center justify-center"
                style={{ background: "#0f2e5a", border: "2px dashed #1a6fd480" }}
              >
                <div className="text-white/20 scale-[3]">
                  <IconQR />
                </div>
              </div>
              <p className="text-white/40 text-sm text-center px-8">
                Наведите камеру на QR-код у въезда или на парковочном месте
              </p>
              <button
                className="px-8 py-3.5 rounded-2xl text-white font-semibold"
                style={{ background: "linear-gradient(135deg, #1a6fd4, #0d4fa0)" }}
              >
                Открыть камеру
              </button>
            </div>
          )}

          {tab === "reports" && (
            <div className="space-y-4">
              <h2 className="text-white/50 text-xs uppercase tracking-widest font-semibold px-1">
                Reports
              </h2>
              {[
                { label: "Этот месяц", visits: 12, spent: "2 400 сом" },
                { label: "Прошлый месяц", visits: 9, spent: "1 800 сом" },
              ].map((r) => (
                <div
                  key={r.label}
                  className="rounded-2xl px-4 py-4"
                  style={{ background: "#0f2e5a", border: "1px solid #1a4b8230" }}
                >
                  <p className="text-white font-semibold mb-3">{r.label}</p>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-white/40 text-xs mb-0.5">Визиты</p>
                      <p className="text-white font-bold text-xl">{r.visits}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs mb-0.5">Потрачено</p>
                      <p className="text-white font-bold text-xl">{r.spent}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "profile" && (
            <div className="space-y-3">
              {[
                { label: "User", value: user.name },
                { label: "Car", value: user.car },
                { label: "Car numbers", value: user.plate },
                { label: "Password", value: user.pass, secret: true },
              ].map((f) => (
                <div
                  key={f.label}
                  className="rounded-2xl px-4 py-3.5"
                  style={{ background: "#0f2e5a", border: "1px solid #1a4b8230" }}
                >
                  <p className="text-white/40 text-xs mb-1">{f.label}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-white font-semibold">
                      {f.secret ? "•".repeat(f.value.length) : f.value}
                    </p>
                    <button className="text-white/40 p-1 active:text-white transition-colors">
                      <IconEdit />
                    </button>
                  </div>
                </div>
              ))}

              <div
                className="rounded-2xl px-4 py-3.5 mt-2"
                style={{ background: "#0f2e5a", border: "1px solid #1a4b8230" }}
              >
                <p className="text-white/40 text-xs mb-2">No account?</p>
                <button className="text-[#4da3ff] font-semibold text-sm">Sign up</button>
              </div>
            </div>
          )}
        </main>

        {/* ── Bottom Nav ───────────────────────────────────────────── */}
        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full flex items-center justify-around px-6 pt-3 pb-8 shrink-0"
          style={{ maxWidth: 400, background: "#001a38", borderTop: "1px solid #0f3060" }}
        >
          {[
            { id: "dashboard", label: "Dashboard", Icon: IconDashboard },
            { id: "qr", label: "QR/Scan", Icon: IconQR },
            { id: "reports", label: "Reports", Icon: IconReports },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex flex-col items-center gap-1 transition-all active:scale-90"
              style={{ color: tab === id ? "#4da3ff" : "#ffffff40" }}
            >
              <Icon />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </nav>

        {/* ── Pay Modal ────────────────────────────────────────────── */}
        {showPay && (
          <PayModal
            amount={stats.amount}
            onClose={() => setShowPay(false)}
            onPay={handlePay}
          />
        )}

        {/* ── Toast ────────────────────────────────────────────────── */}
        {toast && (
          <div
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-white text-sm font-medium shadow-xl"
            style={{ background: "#4ade80", color: "#001a38", maxWidth: 320, width: "90%" }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
