import { useState, useEffect, useRef, useCallback } from "react";
import {
  Car, MapPin, Clock, CreditCard, LogOut, User,
  History, Home, ParkingCircle, Shield, RefreshCw,
  Eye, EyeOff, ArrowLeft, AlertCircle,
} from "lucide-react";

const DEMO_MODE = false;
const BASE_URL = "http://localhost:8080";

async function apiCall(path, options = {}) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new CustomEvent("auth:logout"));
      throw new Error("Сессия истекла");
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const errorMsg = data?.message || data?.error || "Ошибка запроса";
      throw new Error(errorMsg);
    }
    return data;
  } catch (err) {
    if (err.message === "Failed to fetch") throw new Error("Сервер недоступен");
    throw err;
  }
}

const RATE_PER_MINUTE = 1;

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function initUser() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user) {
      return {
        ...user,
        car_number: user.car_number || user.plate || "",
        car_model: user.car_model || user.car || "",
      };
    }
    return null;
  } catch { return null; }
}

function PinInput({ value, onChange, length = 4 }) {
  const refs = useRef([]);
  function handleChange(i, v) {
    const digit = v.replace(/\D/, "").slice(-1);
    const arr = value.split("");
    arr[i] = digit;
    onChange(arr.join(""));
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  }
  function handleKeyDown(i, e) {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      const arr = value.split("");
      arr[i - 1] = "";
      onChange(arr.join(""));
      refs.current[i - 1]?.focus();
    }
  }
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          style={{
            width: 54, height: 62,
            background: value[i] ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
            border: `2px solid ${value[i] ? "#3b82f6" : "rgba(59,130,246,0.22)"}`,
            borderRadius: 14,
            color: "#e0f0ff",
            fontSize: 26,
            textAlign: "center",
            outline: "none",
            fontFamily: "'DM Mono', monospace",
          }}
        />
      ))}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose?.()} style={{ position: "fixed", inset: 0, background: "rgba(2,8,20,0.88)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div style={{ background: "linear-gradient(145deg, #0e2044 0%, #091628 100%)", border: "1px solid rgba(59,130,246,0.28)", borderRadius: 24, padding: "28px 24px", width: "100%", maxWidth: 360 }}>
        {children}
      </div>
    </div>
  );
}

function Alert({ type, text, onClose }) {
  const colors = {
    error:   { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", color: "#fca5a5" },
    success: { bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.3)", color: "#4ade80" },
    info:    { bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.25)", color: "#93c5fd" },
  };
  const c = colors[type] || colors.info;
  useEffect(() => {
    const timer = setTimeout(onClose, 3800);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 398, background: c.bg, border: `1px solid ${c.border}`, color: c.color, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500, zIndex: 200 }}>
      <AlertCircle size={15} /> {text}
    </div>
  );
}

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Syne', sans-serif; background: #030c1c; color: #c8dff5; min-height: 100dvh; }
  :root { --bg-card: #0a1628; --bg-elev: #0d2040; --accent: #3b82f6; --a-bright: #60a5fa; --t-hi: #e0f0ff; --t-mid: #7da8d0; --border: rgba(59,130,246,0.16); }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse-glow { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); } 70% { box-shadow: 0 0 0 11px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
  .fade-up { animation: fadeUp 0.32s ease-out; }
  .spin { animation: spin 1s linear infinite; }
  .btn-primary { width: 100%; padding: 15px; background: linear-gradient(135deg, #1a49c7 0%, #3b82f6 100%); border: none; border-radius: 14px; color: #fff; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-ghost { width: 100%; padding: 14px; background: transparent; border: 1px solid var(--border); border-radius: 14px; color: var(--t-mid); font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; }
  .btn-ghost:hover { border-color: var(--accent); color: var(--a-bright); }
  .btn-danger { width: 100%; padding: 14px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 14px; color: #fca5a5; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .f-label { display: block; font-size: 11px; font-weight: 600; color: var(--t-mid); text-transform: uppercase; margin-bottom: 7px; }
  .f-input { width: 100%; padding: 13px 16px; background: rgba(59,130,246,0.05); border: 1px solid rgba(59,130,246,0.18); border-radius: 12px; color: var(--t-hi); font-family: 'DM Mono', monospace; font-size: 14px; outline: none; }
  .f-input:focus { border-color: var(--accent); background: rgba(59,130,246,0.09); }
  .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; margin: 0 16px 10px; }
  .card-elev { background: linear-gradient(145deg, #0d2040 0%, #0a1628 100%); border: 1px solid rgba(59,130,246,0.2); border-radius: 20px; padding: 24px; margin: 0 16px 10px; }
  .active-card { background: linear-gradient(140deg, #0b2458 0%, #091a3c 100%); border: 1px solid rgba(59,130,246,0.38); border-radius: 24px; padding: 26px; margin: 0 16px 10px; position: relative; overflow: hidden; }
  .pulse-dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; animation: pulse-glow 1.9s ease-in-out infinite; }
  .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; background: rgba(6,14,32,0.96); backdrop-filter: blur(20px); border-top: 1px solid rgba(59,130,246,0.1); display: flex; padding: 8px 0; z-index: 50; }
  .nav-btn { flex: 1; background: none; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 5px 0; font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600; color: rgba(125,168,208,0.6); }
  .nav-btn.active { color: var(--a-bright); }
  .hr { height: 1px; background: linear-gradient(to right, transparent, rgba(59,130,246,0.14), transparent); margin: 16px 0; }
  .badge-on { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: #4ade80; display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; }
  .badge-off { background: rgba(125,168,208,0.07); border: 1px solid var(--border); color: var(--t-mid); display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; }
`;

export default function App() {
  const [authPage, setAuthPage] = useState("login");
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(initUser);
  const [tab, setTab] = useState("home");
  const [form, setForm] = useState({ carNumber: "", password: "", name: "", carModel: "" });
  const [showPass, setShowPass] = useState(false);
  const [pinA, setPinA] = useState("");
  const [pinB, setPinB] = useState("");
  const [payPin, setPayPin] = useState("");
  const [alert, setAlert] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [parkingStatus, setParkingStatus] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const isLoggedIn = !!token && !!user;

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    const handleAuthLogout = () => { setToken(""); setUser(null); setAuthPage("login"); };
    window.addEventListener("auth:logout", handleAuthLogout);
    return () => window.removeEventListener("auth:logout", handleAuthLogout);
  }, []);

  useEffect(() => {
    if (!parkingStatus?.is_active || !parkingStatus?.entry_time) { setElapsed(0); return; }
    const entry = new Date(parkingStatus.entry_time).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - entry) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [parkingStatus?.is_active, parkingStatus?.entry_time]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const fetch = async () => {
      try {
        const [status, avail] = await Promise.all([
          apiCall("/api/user/stats"),
          apiCall("/api/stats")
        ]);
        setParkingStatus(status);
        setAvailability(avail);
      } catch(e) { console.error(e); }
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && tab === "history" && history === null) {
      const fetchHistory = async () => {
        setHistLoading(true);
        try {
          const data = await apiCall("/api/history");
          setHistory(Array.isArray(data) ? data : []);
        } catch(e) { setHistory([]); }
        finally { setHistLoading(false); }
      };
      fetchHistory();
    }
  }, [tab, isLoggedIn]);

  const flash = useCallback((type, text) => setAlert({ type, text }), []);
  const clearAlert = useCallback(() => setAlert(null), []);

  const patchForm = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleRegister = async (e) => {
    e.preventDefault();
    const { name, carNumber, carModel, password } = form;
    if (!name || !carNumber || !carModel || !password) {
      flash("error", "Заполните все поля");
      return;
    }
    setLoading(true);
    try {
      await apiCall("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          car_number: carNumber.toUpperCase(),
          car: carModel,
          password
        })
      });
      flash("success", "Аккаунт создан! Войдите.");
      setAuthPage("login");
      setForm({ carNumber: "", password: "", name: "", carModel: "" });
    } catch(err) {
      flash("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiCall("/api/login", {
        method: "POST",
        body: JSON.stringify({
          car_number: form.carNumber.toUpperCase(),
          password: form.password
        })
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      if (!data.has_pin) setAuthPage("set-pin");
      else { setAuthPage("login"); window.location.reload(); }
    } catch(err) {
      flash("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async (e) => {
    e.preventDefault();
    if (pinA.length !== 4 || pinA !== pinB) {
      flash("error", "PIN не совпадает или не 4 цифры");
      return;
    }
    setLoading(true);
    try {
      await apiCall("/api/set-pin", { method: "POST", body: JSON.stringify({ pin: pinA }) });
      const updatedUser = { ...user, has_pin: true };
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setPinA(""); setPinB("");
      setAuthPage("login");
      flash("success", "PIN установлен");
    } catch(err) {
      flash("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (payPin.length !== 4) {
      flash("error", "Введите 4 цифры PIN");
      return;
    }
    setLoading(true);
    try {
      await apiCall("/api/verify-pin", { method: "POST", body: JSON.stringify({ pin: payPin }) });
      const payData = await apiCall("/api/user/pay", { method: "POST", body: JSON.stringify({ method: "Cash" }) });
      setShowPayModal(false);
      setPayPin("");
      flash("success", `Оплачено ${payData.amount} сом`);
      const [status, avail] = await Promise.all([
        apiCall("/api/user/stats"),
        apiCall("/api/stats")
      ]);
      setParkingStatus(status);
      setAvailability(avail);
      setHistory(null);
    } catch(err) {
      flash("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setParkingStatus(null);
    setAvailability(null);
    setHistory(null);
    setAuthPage("login");
    setTab("home");
  };

  const liveCost = Math.floor(elapsed / 60) * RATE_PER_MINUTE;
  const occupiedPct = availability ? Math.round(((availability.total_spaces - availability.free_spaces) / availability.total_spaces) * 100) : 0;

  if (!isLoggedIn || authPage === "set-pin") {
    return (
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px" }}>
        {alert && <Alert {...alert} onClose={clearAlert} />}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <ParkingCircle size={48} color="#60a5fa" />
          <div style={{ fontSize: 22, fontWeight: 800 }}>ParkingPro</div>
          <div style={{ fontSize: 12, color: "#7da8d0" }}>Smart Parking</div>
        </div>
        {authPage === "login" && (
          <div className="card-elev fade-up">
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>Вход</h2>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: 14 }}>
                <label className="f-label">Номер авто</label>
                <input className="f-input" placeholder="01KG777TTT" value={form.carNumber} onChange={e => patchForm("carNumber", e.target.value)} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label className="f-label">Пароль</label>
                <div style={{ position: "relative" }}>
                  <input className="f-input" type={showPass ? "text" : "password"} value={form.password} onChange={e => patchForm("password", e.target.value)} style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#7da8d0" }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Загрузка..." : "Войти"}</button>
            </form>
            <div className="hr" />
            <button className="btn-ghost" onClick={() => setAuthPage("register")}>Регистрация</button>
          </div>
        )}
        {authPage === "register" && (
          <div className="card-elev fade-up">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <button type="button" onClick={() => setAuthPage("login")} style={{ background: "none", border: "none", cursor: "pointer" }}><ArrowLeft size={20} /></button>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Регистрация</h2>
            </div>
            <form onSubmit={handleRegister}>
              <div style={{ marginBottom: 13 }}><label className="f-label">Полное имя</label><input className="f-input" placeholder="Иван Иванов" value={form.name} onChange={e => patchForm("name", e.target.value)} /></div>
              <div style={{ marginBottom: 13 }}><label className="f-label">Номер авто</label><input className="f-input" placeholder="01KG777TTT" value={form.carNumber} onChange={e => patchForm("carNumber", e.target.value.toUpperCase())} /></div>
              <div style={{ marginBottom: 13 }}><label className="f-label">Марка и модель</label><input className="f-input" placeholder="Toyota Camry" value={form.carModel} onChange={e => patchForm("carModel", e.target.value)} /></div>
              <div style={{ marginBottom: 20 }}><label className="f-label">Пароль</label><input className="f-input" type="password" value={form.password} onChange={e => patchForm("password", e.target.value)} /></div>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Загрузка..." : "Создать аккаунт"}</button>
            </form>
          </div>
        )}
        {authPage === "set-pin" && (
          <div className="card-elev fade-up" style={{ textAlign: "center" }}>
            <Shield size={48} color="#60a5fa" />
            <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 16 }}>Установите PIN</h2>
            <p style={{ fontSize: 13, marginBottom: 28 }}>PIN потребуется для оплаты</p>
            <form onSubmit={handleSetPin}>
              <p className="f-label">Придумайте PIN</p><PinInput value={pinA} onChange={setPinA} />
              <p className="f-label" style={{ marginTop: 24 }}>Подтвердите PIN</p><PinInput value={pinB} onChange={setPinB} />
              <button type="submit" className="btn-primary" disabled={loading || pinA.length !== 4 || pinB.length !== 4} style={{ marginTop: 28 }}>{loading ? "Сохранение..." : "Сохранить"}</button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100dvh", position: "relative" }}>
      {alert && <Alert {...alert} onClose={clearAlert} />}
      {showPayModal && (
        <Modal onClose={() => { setShowPayModal(false); setPayPin(""); }}>
          <div style={{ textAlign: "center" }}>
            <CreditCard size={40} color="#60a5fa" />
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>Подтвердите оплату</h3>
            <p>К оплате: <span style={{ color: "#60a5fa", fontWeight: 600 }}>{liveCost} сом</span></p>
            <p style={{ fontSize: 12, marginBottom: 26 }}>Введите PIN</p>
            <PinInput value={payPin} onChange={setPayPin} />
            <button className="btn-primary" disabled={loading || payPin.length !== 4} style={{ marginTop: 24 }} onClick={handlePay}>{loading ? "Обработка..." : "Оплатить"}</button>
            <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => { setShowPayModal(false); setPayPin(""); }}>Отмена</button>
          </div>
        </Modal>
      )}
      <div style={{ paddingBottom: 80 }}>
        {tab === "home" && (
          <div>
            <div style={{ padding: "20px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontWeight: 800 }}>ParkingPro</div><div style={{ fontSize: 10, color: "#7da8d0" }}>Smart Parking</div></div>
              {availability && <div><div style={{ fontFamily: "monospace", fontSize: 19 }}>{availability.free_spaces}/{availability.total_spaces}</div><div style={{ fontSize: 10 }}>свободно</div></div>}
            </div>
            <div style={{ padding: "0 20px 18px" }}><p>Добро пожаловать,</p><h1 style={{ fontSize: 23, fontWeight: 800 }}>{user?.name}</h1></div>
            {parkingStatus === null ? (
              <div className="card" style={{ textAlign: "center", padding: 36 }}><RefreshCw className="spin" /></div>
            ) : parkingStatus.is_active ? (
              <div className="active-card">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div className="pulse-dot" /><span className="badge-on">На парковке</span></div>
                <div style={{ fontFamily: "monospace", fontSize: 40 }}>{formatDuration(elapsed)}</div>
                <div style={{ fontSize: 26, color: "#60a5fa" }}>{liveCost} сом</div>
                <div className="hr" />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                  <div><p style={{ fontSize: 10 }}>Въезд</p><p>{new Date(parkingStatus.entry_time).toLocaleTimeString()}</p></div>
                  <div><p style={{ fontSize: 10 }}>Тариф</p><p>1 сом/мин</p></div>
                </div>
                <button className="btn-primary" onClick={() => setShowPayModal(true)}>Оплатить</button>
              </div>
            ) : (
              <div className="card-elev" style={{ textAlign: "center", padding: 30 }}>
                <Car size={48} color="#60a5fa" />
                <p style={{ fontSize: 16, fontWeight: 700, marginTop: 14 }}>Не на парковке</p>
                <p style={{ fontSize: 13 }}>{user?.car} · {user?.plate}</p>
                {/* Кнопка «Начать парковку» УДАЛЕНА */}
              </div>
            )}
            {availability && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Загруженность</span><span>{occupiedPct}%</span></div>
                <div style={{ height: 7, background: "rgba(59,130,246,0.08)", borderRadius: 4, marginTop: 8 }}><div style={{ width: `${occupiedPct}%`, height: "100%", background: "#60a5fa", borderRadius: 4 }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 8 }}>
                  <span>Занято: {availability.total_spaces - availability.free_spaces}</span>
                  <span>Активно: {availability.active_now}</span>
                  <span style={{ color: "#4ade80" }}>Свободно: {availability.free_spaces}</span>
                </div>
              </div>
            )}
          </div>
        )}
        {tab === "history" && (
          <div>
            <div style={{ padding: "20px 20px 14px", display: "flex", justifyContent: "space-between" }}><h1 style={{ fontSize: 20, fontWeight: 800 }}>История</h1><button onClick={() => setHistory(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><RefreshCw className={histLoading ? "spin" : ""} size={18} /></button></div>
            <div style={{ padding: "0 16px" }}>
              {histLoading ? <div style={{ textAlign: "center", padding: 56 }}><RefreshCw className="spin" /></div> :
              !history || history.length === 0 ? <div className="card-elev" style={{ textAlign: "center" }}><History size={48} /><p>Нет записей</p></div> :
              <div className="card-elev" style={{ padding: "6px 20px" }}>
                {history.map((rec, idx) => (
                  <div key={rec.ID || idx} style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderBottom: idx < history.length-1 ? "1px solid rgba(59,130,246,0.08)" : "none" }}>
                    <div><p style={{ fontWeight: 700 }}>{new Date(rec.EntryTime).toLocaleDateString()}</p><p style={{ fontSize: 12 }}>{new Date(rec.EntryTime).toLocaleTimeString()} → {rec.ExitTime ? new Date(rec.ExitTime).toLocaleTimeString() : "—"}</p></div>
                    <div><p style={{ fontSize: 18, color: "#60a5fa" }}>{rec.Amount} сом</p><span className="badge-off">Оплачено</span></div>
                  </div>
                ))}
              </div>}
            </div>
          </div>
        )}
        {tab === "profile" && (
          <div>
            <div style={{ padding: "20px 20px 14px" }}><h1 style={{ fontSize: 20, fontWeight: 800 }}>Профиль</h1></div>
            <div style={{ padding: "0 16px" }}>
              <div className="card-elev" style={{ display: "flex", alignItems: "center", gap: 16 }}><div style={{ width: 70, height: 70, borderRadius: "50%", background: "linear-gradient(135deg,#1a49c7,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800 }}>{user?.name?.[0]}</div><div><p style={{ fontSize: 18, fontWeight: 800 }}>{user?.name}</p><p style={{ fontSize: 12 }}>{user?.plate}</p></div></div>
              <div className="card" style={{ display: "flex", gap: 14 }}><Car size={20} /><div><p className="f-label">Марка</p><p>{user?.car}</p></div></div>
              <div className="card" style={{ display: "flex", gap: 14 }}><MapPin size={20} /><div><p className="f-label">Номер</p><p>{user?.plate}</p></div></div>
              <div className="card" style={{ display: "flex", gap: 14 }}><Shield size={20} color={user?.has_pin ? "#4ade80" : "#f59e0b"} /><div><p className="f-label">PIN-защита</p><p>{user?.has_pin ? "Активна" : "Не установлена"}</p></div></div>
              <div className="hr" />
              <button className="btn-danger" onClick={handleLogout}><LogOut size={16} /> Выйти</button>
            </div>
          </div>
        )}
      </div>
      <nav className="bottom-nav">
        <button className={`nav-btn ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}><Home size={22} /><span>Главная</span></button>
        <button className={`nav-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}><History size={22} /><span>История</span></button>
        <button className={`nav-btn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}><User size={22} /><span>Профиль</span></button>
      </nav>
    </div>
  );
}