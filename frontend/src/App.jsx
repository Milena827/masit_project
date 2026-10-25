import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Users, LineChart as LineChartIcon, Server, MessageSquare, 
  FileSpreadsheet, Filter, Search, UploadCloud, X, 
  Download, BarChart3, ShieldCheck, CalendarDays, 
  CircleHelp, Activity, CheckCircle2, AlertCircle, Plus, 
  ArrowUpRight, Bot, Send, Settings2, Menu, ChevronDown, LogOut, Terminal, Database
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, Line, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import './App.css';

// --- ДАННЫЕ ДЛЯ ГРАФИКОВ ---
const costTrend = [
  { month: "Янв", actual: 10.2, forecast: null }, { month: "Фев", actual: 10.5, forecast: null },
  { month: "Мар", actual: 10.1, forecast: null }, { month: "Апр", actual: 11.0, forecast: null },
  { month: "Май", actual: 11.2, forecast: null }, { month: "Июн", actual: 10.8, forecast: null },
  { month: "Июл", actual: 11.5, forecast: null }, { month: "Авг", actual: 11.8, forecast: null },
  { month: "Сен", actual: 12.0, forecast: 12.0 }, { month: "Окт", actual: null, forecast: 12.2 },
  { month: "Ноя", actual: null, forecast: 12.5 }, { month: "Дек", actual: null, forecast: 12.8 },
];

const forecastRows = [
  { account: "Учётная запись (Аренда СКП)", actual: "24.8 млн", forecast: "26.4 млн", mae: "4.2%", accuracy: "Высокая" },
];

const navItems = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "accounts", label: "Неактивные УЗ", icon: Users },
  { id: "upload", label: "Загрузка данных", icon: Database, adminOnly: true },
  { id: "forecast", label: "Прогноз затрат", icon: LineChartIcon },
  { id: "systems", label: "Оценка систем", icon: Server },
  { id: "assistant", label: "Чат-помощник", icon: MessageSquare },
];

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---
const Panel = ({ title, subtitle, children, action, className = "" }) => (
  <div className={`panel ${className}`}>
    <div className="panel-heading">
      <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      {action && <div>{action}</div>}
    </div>
    {children}
  </div>
);

const StatusBadge = ({ children }) => (
  <span className={`status-badge ${children === "Неактивен" ? "inactive" : "warning"}`}>
    <span className="status-dot"></span>{children}
  </span>
);

export default function App() {
  const [activeModule, setActiveModule] = useState("accounts");
  const [role, setRole] = useState("Администратор");
  
  const [accounts, setAccounts] = useState([]);
  const [employeeType, setEmployeeType] = useState("Все");
  const [officeThreshold, setOfficeThreshold] = useState(90);
  const [shiftThreshold, setShiftThreshold] = useState(61);
  
  const [search, setSearch] = useState("");
  const [selectedSystem, setSelectedSystem] = useState("Все системы");
  const [visibleCount, setVisibleCount] = useState(50);
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);

  const [isShrLoaded, setIsShrLoaded] = useState(false);
  const [isExclLoaded, setIsExclLoaded] = useState(false);
  const [isKitcLoaded, setIsKitcLoaded] = useState(false);

  const [horizon, setHorizon] = useState("1 год");
  const [systemName, setSystemName] = useState("");
  const [systemDescription, setSystemDescription] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  
  const [messages, setMessages] = useState([{ from: "bot", text: "Здравствуйте! Введите ФИО (или несколько через запятую), чтобы найти учетные записи.", time: "09:00" }]);
  const [chatInput, setChatInput] = useState("");
  const [searchResults, setSearchResults] = useState(null);

  const shrInputRef = useRef(null);
  const exclInputRef = useRef(null);
  const kitcInputRef = useRef(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/accounts");
      const data = await res.json();
      setAccounts(data);
      if (data.length > 0) {
        setIsKitcLoaded(true);
        setIsShrLoaded(true);
        setIsExclLoaded(true);
      }
    } catch (e) { console.error("Ошибка БД"); }
  };

  const uploadFile = async (e, endpoint, fileName) => {
    const file = e.target.files ? e.target.files[0] : e.dataTransfer?.files[0];
    if (!file) return;

    setLoading(true);
    setLogs(`[СИСТЕМА] Отправка ${fileName}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/${endpoint}`, {
        method: "POST",
        body: formData
      });
      const result = await res.json();
      setLogs(prev => prev + `\n[УСПЕХ] Сервер: ${JSON.stringify(result)}`);
      
      if (endpoint === 'upload-kitc') { fetchAccounts(); setIsKitcLoaded(true); }
      if (endpoint === 'upload-shr') setIsShrLoaded(true);
      if (endpoint === 'upload-exclusions') setIsExclLoaded(true);

    } catch (err) {
      setLogs(prev => prev + `\n[ОШИБКА] ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSearch = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const query = chatInput;
    setMessages(prev => [...prev, { from: "user", text: `Найди: ${query}`, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }]);
    setChatInput("");
    setSearchResults(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/search-fio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        setSearchResults(data.results);
        setMessages(prev => [...prev, { from: "bot", text: `Найдено ${data.results.length} записей. Скачайте их в Excel.`, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }]);
      } else {
        setMessages(prev => [...prev, { from: "bot", text: "Ничего не найдено.", time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { from: "bot", text: "Ошибка при поиске.", time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }]);
    }
  };

  const downloadChatResults = () => {
    if (!searchResults) return;
    const csv = ["ФИО;Логин;Наименование ИС;Дата последней авторизации;Тип сотрудника", ...searchResults.map(r => `${r.fio};${r.login};${r.system};${r.last_date};${r.type}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "chat_search_results.csv";
    a.click();
  };

  const downloadCurrentTable = () => {
    const csv = ["ФИО;Логин;Система;Дата последней авторизации;Дней без входа;Тип сотрудника", ...filteredAccounts.map(r => `${r.fio};${r.login};${r.system};${r.last_date};${r.days};${r.emp_type}`)].join("\n");
    const fileName = selectedSystem === "Все системы" ? "Неактивные_УЗ_Все_системы.csv" : `${selectedSystem}.csv`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = fileName;
    a.click();
  };

  // Скачивание ZIP-архива с отдельными файлами Excel для каждой системы
  const downloadAllSystems = async () => {
    if (!filteredAccounts.length) return;
    
    const zip = new JSZip();
    const systemsMap = {};

    // Группируем по системам
    filteredAccounts.forEach(acc => {
      if (!systemsMap[acc.system]) systemsMap[acc.system] = [];
      systemsMap[acc.system].push({
        "ФИО": acc.fio,
        "Логин": acc.login,
        "Дата последней авторизации": acc.last_date,
        "Дней без входа": acc.days,
        "Тип сотрудника": acc.emp_type
      });
    });

    // Создаем отдельный файл для каждой системы
    Object.keys(systemsMap).forEach(sysName => {
      const ws = XLSX.utils.json_to_sheet(systemsMap[sysName]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "УЗ");
      
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const safeFileName = sysName.replace(/[\\\/\?\*\[\]\:]/g, '_');
      
      zip.file(`${safeFileName}.xlsx`, excelBuffer);
    });

    // Скачиваем ZIP
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "Неактивные_УЗ_по_системам.zip";
    a.click();
  };

  const uniqueSystems = ["Все системы", ...Array.from(new Set(accounts.map(a => a.system))).sort()];

  const filteredAccounts = accounts.filter(acc => {
    if (acc.last_date === "-" || acc.days === 0) return false;

    const matchSearch = acc.fio.toLowerCase().includes(search.toLowerCase()) || acc.login.toLowerCase().includes(search.toLowerCase());
    
    let matchType = true;
    if (employeeType === "Офисный") matchType = acc.emp_type === "Офисный";
    else if (employeeType === "Вахтовый") matchType = acc.emp_type === "Вахтовый";

    let matchThreshold = false;
    if (acc.emp_type === "Офисный") matchThreshold = acc.days > Number(officeThreshold);
    else if (acc.emp_type === "Вахтовый") matchThreshold = acc.days > Number(shiftThreshold);

    const matchSystem = selectedSystem === "Все системы" || acc.system === selectedSystem;

    return matchSearch && matchType && matchThreshold && matchSystem; 
  });

  const displayedAccounts = filteredAccounts.slice(0, visibleCount);

  // --- РЕНДЕРЫ ВКЛАДОК ---

  const renderOverview = () => (
    <>
      <div className="page-intro"><div><h2>Обзор системы</h2><p>Ключевые показатели эффективности использования ИТ-активов</p></div><span className="updated"><CalendarDays size={14}/> Данные на 25.10.2026</span></div>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-top">Всего учетных записей <span className="metric-icon blue"><Users size={16}/></span></div><div className="metric-value">14 572</div><div className="metric-bottom"><span className="metric-sub">в корпоративном контуре</span></div></div>
        <div className="metric-card"><div className="metric-top">Неактивные УЗ <span className="metric-icon blue"><Activity size={16}/></span></div><div className="metric-value">{filteredAccounts.length}</div><div className="metric-bottom"><span className="metric-trend"><ArrowUpRight size={12}/> по текущим фильтрам</span></div></div>
        <div className="metric-card"><div className="metric-top">Прогноз затрат (1 год) <span className="metric-icon blue"><LineChartIcon size={16}/></span></div><div className="metric-value">24,8 млн ₽</div><div className="metric-bottom"><span className="metric-sub">MAE прогноза: 8.1%</span></div></div>
        <div className="metric-card"><div className="metric-top">Потенциал экономии <span className="metric-icon blue"><ShieldCheck size={16}/></span></div><div className="metric-value">3,2 млн ₽</div><div className="metric-bottom"><span className="metric-sub">за счет блокировки</span></div></div>
      </div>
      <div className="chart-grid">
        <Panel title="Динамика затрат" subtitle="Фактические значения и прогноз, млн ₽">
          <div className="chart-wrap"><ResponsiveContainer width="100%" height={260}><LineChart data={costTrend}><CartesianGrid stroke="#E8EDF3" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fontSize:10,fill:"#778392"}}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11,fill:"#778392"}}/><Tooltip formatter={(v)=>`${v} млн ₽`}/><Line dataKey="actual" stroke="#005BAA" strokeWidth={2.5} dot={{r:3}} connectNulls={false}/><Line dataKey="forecast" stroke="#005BAA" strokeWidth={2.2} strokeDasharray="6 5" dot={false}/></LineChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Распределение по системам" subtitle="Доля неактивных записей, %">
          <div className="chart-wrap"><ResponsiveContainer width="100%" height={260}><BarChart data={[{ name: "SAP", value: 45 }, { name: "1С", value: 25 }, { name: "КИТС", value: 20 }, { name: "Directum", value: 10 }]}><CartesianGrid stroke="#E8EDF3" vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize:10,fill:"#778392"}}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11,fill:"#778392"}}/><Tooltip formatter={(v)=>`${v}%`}/><Bar dataKey="value" fill="#005BAA" radius={[2,2,0,0]} barSize={28}/></BarChart></ResponsiveContainer></div>
        </Panel>
      </div>
    </>
  );

  const renderAccounts = () => (
    <>
      <div className="page-intro">
        <div><h2>Анализ учетных записей</h2><p>Общий список неактивных сотрудников</p></div>
      </div>
      
      <Panel title="Параметры анализа" className="filter-panel">
        <div className="filters-row">
          <label>Тип сотрудника
            <select value={employeeType} onChange={(e)=>{setEmployeeType(e.target.value); setVisibleCount(50);}}>
              <option>Все</option><option>Офисный</option><option>Вахтовый</option>
            </select>
          </label>
          
          {(employeeType === "Все" || employeeType === "Офисный") && (
            <label>Порог офисных (дней)<input type="number" value={officeThreshold} onChange={(e)=>{setOfficeThreshold(e.target.value); setVisibleCount(50);}}/></label>
          )}
          {(employeeType === "Все" || employeeType === "Вахтовый") && (
            <label>Порог вахтовых (дней)<input type="number" value={shiftThreshold} onChange={(e)=>{setShiftThreshold(e.target.value); setVisibleCount(50);}}/></label>
          )}

          <label>Система
            <select value={selectedSystem} onChange={(e)=>{setSelectedSystem(e.target.value); setVisibleCount(50);}}>
              {uniqueSystems.map(sys => <option key={sys} value={sys}>{sys}</option>)}
            </select>
          </label>

          <label className="search-label">Поиск
            <div className="input-with-icon"><Search size={15}/><input value={search} onChange={(e)=>{setSearch(e.target.value); setVisibleCount(50);}} placeholder="ФИО или логин"/></div>
          </label>
          <div className="filter-count"><b>{filteredAccounts.length}</b><span>записей найдено</span></div>
        </div>
      </Panel>

      <div className="systems-layout" style={{ marginBottom: '16px' }}>
        <Panel title="Шаг 1. Штатное расписание (ШР)" subtitle="Требуется для определения типа">
          <div className={`dropzone ${isShrLoaded ? 'loaded' : ''}`} style={{ margin: "19px" }} onClick={()=>shrInputRef.current?.click()}>
            <input ref={shrInputRef} type="file" accept=".xlsx" hidden onChange={(e)=>uploadFile(e, 'upload-shr', 'ШР')} />
            <span className="upload-icon">{isShrLoaded ? <CheckCircle2 size={21} style={{ color: "green" }}/> : <UploadCloud size={21}/>}</span>
            <div><b>{isShrLoaded ? "ШР загружен" : "Загрузить ШР"}</b><span>{isShrLoaded ? "Нажмите, чтобы обновить" : "XLSX"}</span></div>
          </div>
        </Panel>
        <Panel title="Шаг 2. Выгрузка КИТС" subtitle="Общий файл с учетными записями">
          <div className={`dropzone ${isKitcLoaded ? 'loaded' : ''}`} style={{ margin: "19px" }} onClick={()=>kitcInputRef.current?.click()}>
            <input ref={kitcInputRef} type="file" accept=".xlsx" hidden onChange={(e)=>uploadFile(e, 'upload-kitc', 'КИТС')} />
            <span className="upload-icon">{isKitcLoaded ? <CheckCircle2 size={21} style={{ color: "green" }}/> : <UploadCloud size={21}/>}</span>
            <div><b>{isKitcLoaded ? "КИТС загружен" : "Загрузить КИТС"}</b><span>{isKitcLoaded ? "Нажмите, чтобы обновить" : "XLSX"}</span></div>
          </div>
        </Panel>
      </div>

      {logs && (
        <div style={{ margin: "0 19px 16px", padding: "15px", background: "#1e1e1e", color: "#00ff00", fontFamily: "monospace", fontSize: "11px" }}>
          {logs}
        </div>
      )}

      <Panel 
        title="Учетные записи (из PostgreSQL)" 
        subtitle={`Показаны записи, превысившие пороги`} 
        action={
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={downloadAllSystems} title="Скачать ZIP-архив с отдельными Excel-файлами для каждой системы">
              <Download size={15}/> Скачать всё (ZIP)
            </button>
            <button className="btn-primary" onClick={downloadCurrentTable} title="Скачать только текущий отфильтрованный список">
              <Download size={15}/> Скачать текущий список
            </button>
          </div>
        }
      >
        <div className="table-scroll">
          <table>
            <thead><tr><th>ФИО</th><th>Логин</th><th>Система</th><th>Дата входа</th><th>Дней</th><th>Тип</th><th>Статус</th></tr></thead>
            <tbody>
              {displayedAccounts.map((row)=>(
                <tr key={row.id}>
                  <td className="person-cell"><span className="avatar">{row.fio.split(" ").map(s=>s[0]).slice(0,2).join("")}</span><b>{row.fio}</b></td>
                  <td className="mono">{row.login}</td>
                  <td>{row.system}</td>
                  <td>{row.last_date}</td>
                  <td><b className="days-number">{row.days}</b></td>
                  <td>{row.emp_type}</td>
                  <td><StatusBadge>Неактивен</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer" style={{ alignItems: 'center' }}>
          <span>Показано {displayedAccounts.length} из {filteredAccounts.length}</span>
          {visibleCount < filteredAccounts.length && <button className="btn-secondary" onClick={() => setVisibleCount(prev => prev + 50)}>Показать еще 50</button>}
        </div>
      </Panel>
    </>
  );

  const renderUpload = () => (
    <>
      <div className="page-intro"><div><h2>Загрузка справочников</h2><p>Админ-панель</p></div></div>
      <div className="systems-layout">
        <Panel title="Справочник исключений УЗ" subtitle="VIP-пользователи">
          <div className={`dropzone ${isExclLoaded ? 'loaded' : ''}`} style={{ margin: "19px" }} onClick={()=>exclInputRef.current?.click()}>
            <input ref={exclInputRef} type="file" accept=".xlsx" hidden onChange={(e)=>uploadFile(e, 'upload-exclusions', 'Справочник')} />
            <span className="upload-icon">{isExclLoaded ? <CheckCircle2 size={21} style={{ color: "green" }}/> : <UploadCloud size={21}/>}</span>
            <div><b>{isExclLoaded ? "Справочник загружен" : "Загрузить справочник"}</b><span>{isExclLoaded ? "Нажмите, чтобы обновить" : "XLSX"}</span></div>
          </div>
        </Panel>
      </div>
    </>
  );

  const renderForecast = () => {
    const chartData = horizon === "1 год" ? costTrend : [...costTrend, {month:"Янв",actual:null,forecast:9.5},{month:"Фев",actual:null,forecast:9.7}];
    return (
      <>
        <div className="page-intro"><div><h2>Прогноз затрат</h2><p>Моделирование затрат на ПО</p></div></div>
        <Panel title="Параметры прогноза"><div className="filters-row"><label>Горизонт<select value={horizon} onChange={(e)=>setHorizon(e.target.value)}><option>1 год</option><option>3 года</option></select></label><div className="filter-count forecast-summary"><b>{horizon === "1 год" ? "24,8 млн ₽" : "76,4 млн ₽"}</b><span>прогноз на {horizon}</span></div></div></Panel>
        <Panel title={`История и прогноз затрат · ${horizon}`} action={<span className="chart-legend"><i className="legend-blue"/>Факт <i className="legend-dash"/>Прогноз</span>}>
          <div className="chart-wrap large-chart"><ResponsiveContainer width="100%" height={340}><LineChart data={chartData} margin={{top:20,right:18,left:0,bottom:5}}><CartesianGrid stroke="#E8EDF3" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fontSize:11,fill:"#778392"}}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11,fill:"#778392"}}/><Tooltip formatter={(v)=>`${v} млн ₽`}/><Line dataKey="actual" stroke="#005BAA" strokeWidth={2.5} dot={{r:3}} connectNulls={false}/><Line dataKey="forecast" stroke="#005BAA" strokeWidth={2.2} strokeDasharray="6 5" dot={false}/></LineChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Точность прогноза (MAE)">
          <div className="table-scroll"><table><thead><tr><th>Статья</th><th>Факт</th><th>Прогноз</th><th>MAE</th><th>Точность</th></tr></thead><tbody>{forecastRows.map(r=><tr key={r.account}><td><b>{r.account}</b></td><td>{r.actual}</td><td>{r.forecast}</td><td className="mono">{r.mae}</td><td><span className={`accuracy ${r.accuracy==="Высокая"?"good":"medium"}`}>{r.accuracy}</span></td></tr>)}</tbody></table></div>
        </Panel>
      </>
    );
  };

  const renderSystems = () => (
    <>
      <div className="page-intro"><div><h2>Оценка систем</h2><p>Оценка приживаемости</p></div></div>
      <div className="systems-layout">
        <Panel title="Новая система">
          <form className="system-form" onSubmit={(e)=>{e.preventDefault();setEvaluation({verdict: systemDescription.length > 50 ? "Приживётся" : "Не приживётся",analog: systemName.includes("SAP") ? "SAP S/4HANA" : "1С: Документооборот",recommendation: systemDescription.length > 50 ? "Внедрять" : "Доработать",note: "Оценка на основе описания."});}}>
            <label>Название<input value={systemName} onChange={(e)=>setSystemName(e.target.value)} placeholder="Например, SAP" required/></label>
            <label>Описание<textarea value={systemDescription} onChange={(e)=>setSystemDescription(e.target.value)} placeholder="Назначение..." rows={6}/></label>
            <button className="btn-primary" type="submit"><Activity size={15}/> Оценить</button>
          </form>
        </Panel>
        <Panel title="Результат">
          {evaluation ? <div className="evaluation-result"><div className={`verdict ${evaluation.verdict==="Приживётся"?"positive":"negative"}`}><span>{evaluation.verdict==="Приживётся"?<CheckCircle2 size={22}/>:<AlertCircle size={22}/>}</span><div><small>Вердикт</small><b>{evaluation.verdict}</b></div></div><div className="result-field"><span>Аналог</span><b>{evaluation.analog}</b></div><div className="result-field"><span>Рекомендация</span><b className="recommendation">{evaluation.recommendation}</b></div></div> : <div className="empty-result"><span><Activity size={25}/></span><b>Заполните форму</b></div>}
        </Panel>
      </div>
    </>
  );

  const renderAssistant = () => (
    <>
      <div className="page-intro"><div><h2>Чат-помощник</h2><p>Поиск учетных записей по ФИО</p></div></div>
      <div className="chat-layout">
        <aside className="chat-topics">
          <div className="topics-title">Подсказки</div>
          <button className="topic-button" onClick={()=>setChatInput("Иванов, Петров")}>
            <span><Users size={16}/></span>ФИО через запятую<ArrowUpRight size={14}/>
          </button>
        </aside>
        
        <section className="chat-panel">
          <div className="chat-header">
            <div className="assistant-avatar"><Bot size={18}/></div>
            <div><b>Поиск по базе</b><span><i className="live-dot"/> В сети</span></div>
          </div>
          
          <div className="chat-messages" style={{ minHeight: '300px' }}>
            {messages.map((m,i)=>(
              <div key={i} className={`message-row ${m.from==="user"?"mine":""}`}>
                <div className={`message-avatar ${m.from}`}>{m.from==="bot"?<Bot size={15}/>: "В"}</div>
                <div className="message-content">
                  <div className="message-bubble">{m.text}</div>
                  <time>{m.time}</time>
                </div>
              </div>
            ))}

            {searchResults && searchResults.length > 0 && (
              <div style={{ marginTop: '10px', background: '#f8fafc', padding: '15px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <b style={{ fontSize: '13px' }}>Найденные УЗ ({searchResults.length})</b>
                  <button className="btn-primary" style={{ height: '26px', fontSize: '10px' }} onClick={downloadChatResults}>
                    <Download size={12}/> Скачать Excel
                  </button>
                </div>
                <table style={{ width: '100%', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>ФИО</th><th>Логин</th><th>Система</th><th>Дата последней авторизации</th><th>Тип</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((r, i) => (
                      <tr key={i}>
                        <td>{r.fio}</td>
                        <td>{r.login}</td>
                        <td>{r.system}</td>
                        <td>{r.last_date}</td>
                        <td>{r.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form className="chat-compose" onSubmit={handleChatSearch}>
            <input 
              value={chatInput} 
              onChange={(e)=>setChatInput(e.target.value)} 
              placeholder="Введите ФИО (например: Иванов, Петров)..." 
            />
            <button className="btn-primary send-button" type="submit" disabled={!chatInput.trim()}>
              Найти
            </button>
          </form>
        </section>
      </div>
    </>
  );

  const moduleContent = { overview: renderOverview, accounts: renderAccounts, upload: renderUpload, forecast: renderForecast, systems: renderSystems, assistant: renderAssistant };
  const title = navItems.find(i => i.id === activeModule)?.label || "Обзор";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block"><div className="brand-mark">К</div><div><b>Корпоративная аналитика</b></div></div>
        <nav>{navItems.map((item)=>{
          if (item.adminOnly && role !== "Администратор") return null;
          return <button key={item.id} className={`nav-item ${activeModule===item.id?"active":""}`} onClick={()=>setActiveModule(item.id)}><item.icon size={17}/><span>{item.label}</span></button>
        })}</nav>
      </aside>
      
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><div className="breadcrumbs"><b>{title}</b></div></div>
          <div className="topbar-actions">
            <div className="role-select"><ShieldCheck size={15}/><select value={role} onChange={(e)=>{setRole(e.target.value); setActiveModule("overview");}}><option>Администратор</option><option>Пользователь</option></select></div>
            <button className="logout-button" onClick={()=>alert("Выход")}><LogOut size={15}/><span>Выйти</span></button>
          </div>
        </header>
        <main className="main-content">{moduleContent[activeModule]()}</main>
      </div>
    </div>
  );
}