"use client";

import { usePlayerName } from "@/core/auth/player-name-context";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import "../styles/memories.css";

const categories = ["全部", "日常", "约会", "旅行", "特别的日子"];
const marks = ["", "🌿", "🌷", "🏔️", "✨"];
type Entry = { id: number; date: string; author: string; category: string; title: string; body: string; scene?: string };
const examples: Entry[] = [
  { id: 1, date: "2026-09-09", author: "player", category: "日常", title: "把今天的晚霞分你一半", body: "下班的路上，天空突然变成了粉橘色。\n第一反应是拍下来给你看，后来想想，还是想和你一起看。", scene: "sunset" },
  { id: 2, date: "2026-09-06", author: "另一半", category: "约会", title: "一家小店，和一个很喜欢的人", body: "绕了两条街才找到的小咖啡馆，窗边的位置刚刚好。\n你说蛋糕太甜，但最后一口还是被你吃掉了。", scene: "coffee" },
  { id: 3, date: "2026-09-06", author: "player", category: "日常", title: "散步也算一件正经事", body: "没有目的地，走到哪里算哪里。今天的步数里，有好多好多一起走的路。" },
  { id: 4, date: "2026-09-03", author: "另一半", category: "特别的日子", title: "平凡日子里的小小庆祝", body: "买了一束花，也买了你爱吃的东西。\n不一定要等特别的日子，和你一起的今天就很好。" },
  { id: 5, date: "2026-08-29", author: "player", category: "旅行", title: "去山里，收集一点绿色", body: "山风很凉，云走得很慢。我们也慢慢走。", scene: "mountain" },
];
const dayThemes: Record<string, string> = { "2026-09-03": "celebration", "2026-09-06": "date", "2026-09-08": "travel", "2026-08-29": "travel" };
const themeNames: Record<string, string> = { date: "约会日", travel: "旅行日", celebration: "特别日" };
const dateLabel = (date: string) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`;

function Scene({ scene }: { scene: string }) {
  return <div className={`memory-scene ${scene}`} role="img" aria-label={`${scene === "coffee" ? "窗边咖啡" : scene === "mountain" ? "山间旅行" : "粉色晚霞"}示意插画`}><span className="memory-scene-sun" /><span className="memory-scene-land" /><span className="memory-scene-object">{scene === "coffee" ? "☕" : ""}</span><small>ILLUSTRATED MEMORY · 图片效果示意</small></div>;
}

export function MemoriesPreview() {
  const playerName = usePlayerName();
  const [entries, setEntries] = useState(examples);
  const [calendarStyle, setCalendarStyle] = useState("airy");
  const [view, setView] = useState<"calendar" | "timeline" | "day">("calendar");
  const [month, setMonth] = useState("2026-09");
  const [selectedDate, setSelectedDate] = useState("2026-09-09");
  const [category, setCategory] = useState("全部");
  const [draftDate, setDraftDate] = useState("2026-09-09");
  const [photo, setPhoto] = useState<string | null>(null);
  const editor = useRef<HTMLDialogElement>(null);
  const lightbox = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState("");
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const visible = entries.filter(entry => (view === "day" ? entry.date === selectedDate : entry.date.startsWith(month)) && (category === "全部" || entry.category === category)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const monthEntries = entries.filter(entry => entry.date.startsWith(month));
  function moveMonth(delta: number) {
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }
  function write(date = "2026-09-09") { setDraftDate(date); editor.current?.showModal(); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = String(data.get("body") || "").trim();
    if (!body) return;
    setEntries(current => [...current, { id: Date.now(), date: draftDate, author: "我", category: String(data.get("category")), title: String(data.get("title") || "").trim(), body }]);
    setMonth(draftDate.slice(0, 7)); setSelectedDate(draftDate); setCategory("全部"); setView("day");
    setNotice("已加入本次预览，刷新页面后会恢复示例记录。");
    event.currentTarget.reset(); editor.current?.close();
  }
  return <main className={`memories-preview calendar-${calendarStyle}`}>
    <nav className="memory-topbar"><Link href="/home">← 回到小屋</Link><span>OUR LITTLE WORLD <b> / </b> MEMORIES</span><span className="memory-preview-label">样式预览</span></nav>
    <div className="memory-wrap">
      <header className="memory-hero"><div><p className="memory-kicker">THE DAYS WITH YOU</p><h1>我们的记录<span>✿</span></h1><p>把平凡又珍贵的日子，慢慢收进这里。</p><div className="memory-hero-note">两个人，一本写不完的生活手账。</div></div><div className="memory-book" aria-hidden="true"><span>OUR<br />little<br /><em>moments.</em></span><b>♡</b><small>你和我的日常收藏</small></div></header>
      <div className="memory-toolbar"><div className="memory-switch" aria-label="查看方式"><button aria-pressed={view === "calendar"} onClick={() => { setView("calendar"); setCategory("全部"); }}>▦ 日历</button><button aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>☷ 时间线</button></div><button className="memory-primary" onClick={() => write(view === "day" ? selectedDate : undefined)}>＋ 记一笔</button></div>
      <section className="calendar-style-picker" aria-label="日历风格对比">
        <div><span className="memory-kicker">选一页喜欢的日常</span><p>同一个月份，对比喜欢的手账风格</p></div>
        <div className="calendar-style-options">
          {[{ id: "airy", name: "清爽绘本", hint: "舒展留白 · 彩色小景" }, { id: "storybook", name: "奶油绘本", hint: "温暖底色 · 柔和插画" }, { id: "watercolor", name: "清透水彩", hint: "轻盈晕染 · 细腻线描" }, { id: "minimal", name: "极简手账", hint: "干净留白 · 淡彩笔触" }].map(style => <button key={style.id} aria-pressed={calendarStyle === style.id} onClick={() => { setCalendarStyle(style.id); setView("calendar"); }}><span className={`style-swatch swatch-${style.id}`} aria-hidden="true" /><span><strong>{style.name}</strong><small>{style.hint}</small></span></button>)}
        </div>
      </section>
      <div className="memory-layout"><section className="memory-main">
        <div className="memory-section-title"><div><p className="memory-kicker">{view === "day" ? "ONE LOVELY DAY" : "LITTLE MOMENTS, BIG LOVE"}</p><h2>{view === "day" ? dateLabel(selectedDate) : `${year} 年 ${monthNumber} 月`}<span>{view === "day" ? "这一天的小故事" : "日子慢慢，回忆满满"}</span></h2></div>{view === "day" ? <button className="memory-quiet" onClick={() => setView("calendar")}>← 返回日历</button> : <div className="memory-month-nav"><button aria-label="上个月" onClick={() => moveMonth(-1)}>‹</button><button onClick={() => setMonth("2026-09")}>示例月</button><button aria-label="下个月" onClick={() => moveMonth(1)}>›</button></div>}</div>
        {view === "calendar" ? <><div className="memory-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day}>{day}</span>)}</div><div className="memory-calendar">{Array.from({ length: offset }, (_, i) => <div className="memory-blank" key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const daily = entries.filter(entry => entry.date === date);
          const theme = dayThemes[date];
          return <button key={date} className={`memory-day paper-day ${theme ? `paper-${theme}` : "paper-ordinary"} ${date === "2026-09-09" ? "paper-today" : ""}`} aria-label={`${date}，${themeNames[theme] || "普通日子"}，${daily.length ? "有记录" : "暂无记录"}`} onClick={() => { setSelectedDate(date); setCategory("全部"); setView("day"); }}>
            <span className="paper-number">{i + 1}</span>
            {theme && <span className="paper-art" aria-hidden="true">
              {theme === "date" && <svg viewBox="0 0 100 100"><path d="M57 88Q47 61 69 29M57 78Q35 77 32 61Q49 57 57 78M59 64Q77 65 84 49Q64 44 59 64" fill="#96a084" stroke="#7f9379" strokeWidth="1.5"/><path d="M68 43Q45 34 54 17L66 24L75 12L81 28L91 24Q92 44 68 43" fill="#c98794"/><path d="M20 32C4 20 21 9 26 20C37 9 48 24 20 32" fill="none" stroke="#c78f98" strokeWidth="1.5"/></svg>}
              {theme === "travel" && <svg viewBox="0 0 100 100"><circle cx="75" cy="27" r="10" fill="#e2c685"/><path d="M-10 85L36 28L83 100H-10" fill="#adc2b1"/><path d="M30 36L36 28L48 47L39 43L35 47" fill="#f8f5e8"/><path d="M27 100L77 46L115 100" fill="#7e9c8c"/><path d="M53 99Q78 87 66 77T79 64" fill="none" stroke="#f1e5c5" strokeWidth="2" strokeDasharray="3 3"/></svg>}
              {theme === "celebration" && <svg viewBox="0 0 100 100"><path d="M57 15L62 30L78 32L65 42L68 58L55 50L41 58L45 42L33 31L50 29Z" fill="#d9b468" stroke="#b99652"/><path d="M44 56L39 89L53 78L62 88L65 56" fill="#d7a397"/><path d="M19 49V61M13 55H25M83 64V76M77 70H89M79 12V20M75 16H83" stroke="#b99a59" strokeWidth="1.5"/></svg>}
            </span>}
            {theme && <span className="paper-day-label">{themeNames[theme]}</span>}
            {daily.length > 0 && <span className="paper-record-dot" aria-hidden="true" />}
          </button>;
        })}</div><div className="memory-legend"><span><i className="paper-dot-key" />有记录</span><span>♡ 约会日</span><span>⌁ 旅行日</span><span>✧ 特别日</span><small>点开一天，翻翻我们的故事</small></div></> : <><div className="memory-filters">{categories.map(kind => <button key={kind} aria-pressed={category === kind} onClick={() => setCategory(kind)}>{kind}</button>)}</div><div className="memory-feed">{visible.map(entry => <article className="memory-entry" key={entry.id}><div className="memory-entry-meta"><span className={`memory-avatar ${entry.author === "player" ? "puppy" : ""}`}>{entry.author === "player" ? "🐶" : "🐰"}</span><div><strong>{entry.author === "player" ? playerName : entry.author}</strong><small>{dateLabel(entry.date)} · {entry.date.slice(0, 4)}</small></div><span className="memory-entry-category">{marks[categories.indexOf(entry.category)]} {entry.category}</span></div>{entry.title && <h3>{entry.title}</h3>}<p>{entry.body}</p>{entry.scene && <button className="memory-photo-button" aria-label={`放大：${entry.title}`} onClick={() => { setPhoto(entry.scene!); lightbox.current?.showModal(); }}><Scene scene={entry.scene} /></button>}<footer>♡ 被好好收藏的一天</footer></article>)}{visible.length === 0 && <div className="memory-empty"><span>✉</span><h3>这一页，还等着我们的故事</h3><p>{category !== "全部" ? "换一个分类看看，或留下新的小事。" : "一顿饭、一阵晚风，都值得记下来。"}</p><button className="memory-primary" disabled={view === "day" && selectedDate > "2026-09-09"} onClick={() => write(view === "day" ? selectedDate : undefined)}>{view === "day" && selectedDate > "2026-09-09" ? "这一天还没到来" : "＋ 记一笔"}</button></div>}</div></>}
      </section><aside className="memory-sidebar"><section className="memory-month-note"><span className="memory-tape" /><p className="memory-kicker">OUR SEPTEMBER & MORE</p><h3>日常的小事，<br />都是我们的好事。</h3><p>不用每一天都闪闪发光，<br />有你在的普通日子也值得收藏。</p><div><strong>{monthEntries.length}</strong><span>篇小记</span><strong>{new Set(monthEntries.map(entry => entry.date)).size}</strong><span>个有故事的日子</span></div><span className="memory-note-flower">✿</span></section><section className="memory-recent"><p className="memory-kicker">A PAGE TO REMEMBER</p><h3>最近的一页 <span>↗</span></h3><button onClick={() => { setSelectedDate("2026-09-09"); setMonth("2026-09"); setView("day"); setCategory("全部"); }}><Scene scene="sunset" /><strong>把今天的晚霞分你一半</strong><small>09.09 · 日常 · {playerName}</small></button></section><p className="memory-preview-note">✧ 这里都是虚构的示例记录。<br />试写内容仅在当前页面保留，刷新即重置。<br />预览日期：2026 年 9 月 9 日。</p></aside></div>
      <footer className="memory-bottom">Made of ordinary days & a whole lot of love. <span>♡</span></footer>
      <p className="memory-status" role="status">{notice}</p>
    </div>
    <dialog className="memory-dialog" ref={editor}><form onSubmit={save}><header><div><p className="memory-kicker">KEEP A LITTLE MOMENT</p><h2>今天，想记住什么？</h2></div><button type="button" aria-label="关闭编辑" onClick={() => editor.current?.close()}>×</button></header><p className="memory-form-note">试写预览 · 不会保存到数据库</p><label>发生日期<input type="date" required max="2026-09-09" value={draftDate} onChange={e => setDraftDate(e.target.value)} /></label><label>给这一天一个名字（选填）<input name="title" maxLength={80} placeholder="比如：一起浪费时间的下午" /></label><label>记录分类<select name="category">{categories.slice(1).map(kind => <option key={kind}>{kind}</option>)}</select></label><label>留下你的小故事<textarea name="body" required maxLength={2000} placeholder="从一件小事开始写吧……" rows={5} /></label><div className="memory-upload-placeholder">▧ 照片区域 · 本次仅展示样式，暂不上传</div><button className="memory-primary" type="submit">♡ 加入这次预览</button></form></dialog>
    <dialog className="memory-dialog memory-lightbox" ref={lightbox}><button className="memory-lightbox-close" aria-label="关闭大图" onClick={() => lightbox.current?.close()}>×</button>{photo && <Scene scene={photo} />}<p>照片展示效果示意 · 当前使用插画占位</p></dialog>
  </main>;
}
