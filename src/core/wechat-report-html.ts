import type { WechatReport } from './wechat.js';
import { mediaUrl } from './wechat.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtTime(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.slice(0, 40); }
}

/** Light inline markdown for the AI summary: escape, **bold**, line breaks, bullets. */
function summaryHtml(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^- /gm, '• ')
    .replace(/\n/g, '<br>');
}

/**
 * Self-contained HTML daily report (no external assets), styled after the
 * super-cli web app light theme (warm beige + goldenrod accent). The image
 * table spans full width with fixed sender/time/photo columns; the context
 * column takes the remaining space. Clicking a thumbnail opens a lightbox.
 */
export function renderDailyReportHtml(report: WechatReport): string {
  const { stats } = report;
  const mdUrl = `/api/wechat/report/daily-report.md?talker=${encodeURIComponent(report.talker)}&date=${report.date}&name=${encodeURIComponent(report.chatName)}`;

  const summaryBlock = report.summary
    ? `<div class="summary">${summaryHtml(report.summary)}</div>`
    : report.summaryStatus === 'pending'
      ? `<div class="summary muted">AI 摘要生成中…稍后刷新本页查看${report.summaryNote ? `（${esc(report.summaryNote)}）` : ''}</div>`
      : `<div class="summary muted">${esc(report.summaryNote ?? '未生成 AI 摘要')}</div>`;

  const statItems: [string, string | number][] = [
    ...(stats.firstTime && stats.lastTime ? [['活跃时段', `${fmtTime(stats.firstTime)} ~ ${fmtTime(stats.lastTime)}`] as [string, string]] : []),
    ['消息', stats.totalMessages],
    ['活跃成员', stats.activeMembers],
    ['链接', stats.links],
    ['@我', stats.mentions],
    ['图片', stats.images],
    ['文件', stats.files],
    ['小程序', stats.miniApps],
  ];

  const imagesSection = report.images.length === 0 ? '' : `
<h2>图片（${report.images.length}）</h2>
<table class="photos">
  <thead><tr><th class="c-sender">发送者</th><th class="c-time">时间</th><th class="c-photo">图片</th><th>上下文</th></tr></thead>
  <tbody>
${report.images.map(img => `    <tr>
      <td>${esc(img.sender)}</td>
      <td>${fmtTime(img.time)}</td>
      <td><img class="photo" src="${mediaUrl(img.serverId, report.talker)}" width="120" loading="lazy" alt="图片"></td>
      <td>${[
        img.context?.prev ? `<div class="ctx">↑ <span class="meta">${esc(img.context.prev.sender)} ${fmtTime(img.context.prev.time)}</span> ${esc(img.context.prev.text)}</div>` : '',
        img.context?.next ? `<div class="ctx">↓ <span class="meta">${esc(img.context.next.sender)} ${fmtTime(img.context.next.time)}</span> ${esc(img.context.next.text)}</div>` : '',
      ].filter(Boolean).join('') || '<span class="muted">—</span>'}</td>
    </tr>`).join('\n')}
  </tbody>
</table>`;

  const filesSection = report.files.length === 0 ? '' : `
<h2>文件（${report.files.length}）</h2>
<ul>
${report.files.map(f => `  <li><a href="${mediaUrl(f.serverId, report.talker)}" download="${esc(f.title)}">${esc(f.title)}</a> <span class="muted">${fmtSize(f.size)} · ${esc(f.sender)} ${fmtTime(f.time)}</span></li>`).join('\n')}
</ul>`;

  const linksSection = report.links.length === 0 ? '' : `
<h2>分享链接（${report.links.length}）</h2>
<ul class="links">
${report.links.map(l => `  <li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || domainOf(l.url))}</a> <span class="muted">${l.title ? `${domainOf(l.url)} · ` : ''}${esc(l.sender)} ${fmtTime(l.time)}</span></li>`).join('\n')}
</ul>`;

  const miniAppsSection = report.miniApps.length === 0 ? '' : `
<h2>小程序（${report.miniApps.length}）</h2>
<ul>
${report.miniApps.map(m => `  <li>${esc(m.title)} <span class="muted">${esc(m.sender)} ${fmtTime(m.time)}</span></li>`).join('\n')}
</ul>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${esc(report.chatName)} 日报（${report.date}）</title>
<style>
  /* super-cli web app light theme: warm beige + goldenrod accent */
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 64px; font-family: -apple-system, "PingFang SC", "Helvetica Neue", "Segoe UI", sans-serif; background: #faf7f2; color: #2c2c2c; }
  .page { max-width: 1080px; margin: 0 auto; background: #ffffff; border: 1px solid #e8e2d8; border-radius: 10px; padding: 28px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid #e8e2d8; padding-bottom: 12px; }
  h1 { font-size: 20px; margin: 0; }
  h1 .date { color: #9c9590; font-weight: 400; }
  .md-link { font-size: 12px; color: #b8860b; text-decoration: none; white-space: nowrap; }
  .md-link:hover { text-decoration: underline; }
  h2 { font-size: 16px; margin: 28px 0 10px; color: #2c2c2c; border-left: 3px solid #b8860b; padding-left: 8px; }
  /* Reading-first summary: larger type, generous line height and padding */
  .summary { background: #fdf6e3; border: 1px solid #ede0c0; border-radius: 10px; padding: 18px 22px; font-size: 16px; line-height: 2; letter-spacing: 0.01em; color: #2c2c2c; }
  .summary strong { color: #8a6508; }
  .muted { color: #9c9590; }
  /* Compact single-strip stats: value + label pairs separated by hairlines */
  .stats { display: flex; flex-wrap: wrap; gap: 4px 0; font-size: 13px; color: #6b6560; }
  .stat { display: flex; align-items: baseline; gap: 5px; padding: 0 14px; border-left: 1px solid #e8e2d8; }
  .stat:first-child { padding-left: 0; border-left: none; }
  .stat b { font-size: 15px; color: #2c2c2c; font-weight: 600; }
  ol.members { margin: 0; padding-left: 22px; font-size: 15px; line-height: 2; }
  ul { margin: 0; padding-left: 22px; font-size: 15px; line-height: 2; word-break: break-word; }
  ul.links .muted { font-size: 12px; }
  a { color: #b8860b; text-decoration: none; }
  a:hover { text-decoration: underline; }
  /* Image table: full width, fixed side columns, context column takes the rest. */
  table.photos { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; }
  table.photos th, table.photos td { border-bottom: 1px solid #f0ebe3; padding: 8px 10px; text-align: left; vertical-align: top; }
  table.photos th { color: #6b6560; font-weight: 500; background: #faf7f2; }
  table.photos .c-sender { width: 100px; }
  table.photos .c-time { width: 56px; }
  table.photos .c-photo { width: 136px; }
  table.photos td { word-break: break-word; }
  img.photo { width: 120px; height: auto; display: block; border-radius: 6px; border: 1px solid #e8e2d8; cursor: zoom-in; }
  .ctx { color: #6b6560; line-height: 1.7; }
  .ctx .meta { color: #9c9590; font-size: 13px; }
  #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.88); display: none; align-items: center; justify-content: center; z-index: 50; cursor: zoom-out; }
  #lightbox.open { display: flex; }
  #lightbox img { max-width: 94vw; max-height: 94vh; border-radius: 4px; box-shadow: 0 8px 40px rgba(0,0,0,.5); }
  #lightbox .hint { position: absolute; bottom: 18px; color: rgba(255,255,255,.6); font-size: 12px; }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${esc(report.chatName)} <span class="date">日报（${report.date}）</span></h1>
    <a class="md-link" href="${mdUrl}" target="_blank" rel="noopener">Markdown 源 ↗</a>
  </header>

  <h2>摘要（AI 总结）</h2>
  ${summaryBlock}

  <h2>数据统计</h2>
  <div class="stats">
${statItems.map(([k, v]) => `    <div class="stat">${k} <b>${v}</b></div>`).join('\n')}
  </div>

  <h2>活跃成员 TOP${report.topMembers.length}</h2>
  <ol class="members">
${report.topMembers.map(m => `    <li>${esc(m.name)} <span class="muted">（${m.count} 条）</span></li>`).join('\n')}
  </ol>
${linksSection}
${imagesSection}
${filesSection}
${miniAppsSection}
</div>

<div id="lightbox"><img id="lbImg" alt="大图"><div class="hint">点击任意处或按 Esc 关闭</div></div>
<script>
  var lb = document.getElementById('lightbox'), lbImg = document.getElementById('lbImg');
  Array.prototype.forEach.call(document.querySelectorAll('img.photo'), function (el) {
    el.addEventListener('click', function () { lbImg.src = el.src; lb.classList.add('open'); });
  });
  lb.addEventListener('click', function () { lb.classList.remove('open'); lbImg.src = ''; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { lb.classList.remove('open'); lbImg.src = ''; } });
</script>
</body>
</html>`;
}
