/**
 * annotation-tool.js — 原型页面标注工具
 *
 * 用法：在原型 HTML 中引入即可
 *   <script src="../annotation-tool.js"></script>
 *
 * 功能：
 * - 点击浮窗 📌 进入标注模式
 * - Shift + Click 标注任意元素（不干扰页面正常交互）
 * - ✏️ 改文本 / 💬 写说明 两种标注类型
 * - 导出结构化标注（含 CSS 选择器 + HTML 上下文）
 *
 * 零依赖，零侵入，不修改页面原有代码。
 */
(function () {
  'use strict';

  // ============================================================
  //  配置
  // ============================================================
  const NS = 'annotool';
  const COLORS = {
    primary: '#1677ff',
    text: '#e6f0ff',
    note: '#fa8c16',
    noteBg: '#fff7e6',
    textPrimary: '#1d2129',
    textSecondary: '#86909c',
    border: '#e5e6eb',
    bg: '#fff',
    shadow: 'rgba(0,0,0,0.12)',
  };

  // ============================================================
  //  状态
  // ============================================================
  let isActive = false;
  let annotations = [];
  let nextId = 1;
  let pendingTarget = null; // 当前标注卡片对应的 DOM 元素

  // ============================================================
  //  DOM 引用
  // ============================================================
  let $ = {}; // { btn, panel, card, overlay, exportModal }

  // ============================================================
  //  CSS 注入
  // ============================================================
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
/* ---- 标注工具全局样式 ---- */
.${NS}-hidden { display: none !important; }

/* 浮窗按钮 */
.${NS}-btn {
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483640;
  width: 44px; height: 44px; border-radius: 50%;
  border: none; cursor: pointer; font-size: 20px; line-height: 44px;
  text-align: center; box-shadow: 0 2px 8px ${COLORS.shadow};
  transition: all 0.2s; user-select: none;
  background: ${COLORS.bg}; color: ${COLORS.textSecondary};
}
.${NS}-btn:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.18); transform: scale(1.05); }
.${NS}-btn.active { background: ${COLORS.primary}; color: #fff; }

/* 高亮框 */
.${NS}-highlight {
  outline: 2px dashed ${COLORS.primary} !important;
  outline-offset: 2px !important;
}

/* 元素上标注编号徽章 */
.${NS}-badge {
  position: absolute; z-index: 2147483641;
  padding: 1px 6px; border-radius: 3px;
  font-size: 11px; font-weight: 600; line-height: 1.5;
  pointer-events: none; white-space: nowrap;
}
.${NS}-badge.text { background: ${COLORS.text}; color: ${COLORS.primary}; }
.${NS}-badge.note { background: ${COLORS.noteBg}; color: ${COLORS.note}; }

/* 右侧标注面板 */
.${NS}-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483642;
  width: 340px; background: ${COLORS.bg};
  box-shadow: -2px 0 12px ${COLORS.shadow};
  display: flex; flex-direction: column;
  transition: transform 0.25s ease;
  font-size: 13px; color: ${COLORS.textPrimary};
}
.${NS}-panel.collapsed { transform: translateX(100%); }
.${NS}-panel-header {
  padding: 14px 16px; border-bottom: 1px solid ${COLORS.border};
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; font-size: 14px;
}
.${NS}-panel-actions { display: flex; gap: 6px; }
.${NS}-panel-actions button {
  padding: 4px 12px; border: 1px solid ${COLORS.border};
  border-radius: 4px; background: ${COLORS.bg}; cursor: pointer;
  font-size: 12px; color: ${COLORS.textSecondary}; transition: all 0.15s;
}
.${NS}-panel-actions button:hover { border-color: ${COLORS.primary}; color: ${COLORS.primary}; }
.${NS}-panel-actions .export-btn { background: ${COLORS.primary}; color: #fff; border-color: ${COLORS.primary}; }
.${NS}-panel-actions .export-btn:hover { opacity: 0.9; }
.${NS}-panel-body { flex: 1; overflow-y: auto; padding: 8px 0; }

.${NS}-panel-item {
  padding: 10px 16px; border-bottom: 1px solid #f0f0f0;
  display: flex; align-items: flex-start; gap: 10px;
  cursor: default; transition: background 0.15s;
}
.${NS}-panel-item:hover { background: #fafafa; }
.${NS}-panel-item .id-badge {
  flex-shrink: 0; width: 32px; height: 22px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; margin-top: 1px;
}
.${NS}-panel-item .id-badge.text { background: ${COLORS.text}; color: ${COLORS.primary}; }
.${NS}-panel-item .id-badge.note { background: ${COLORS.noteBg}; color: ${COLORS.note}; }
.${NS}-panel-item .item-content { flex: 1; min-width: 0; }
.${NS}-panel-item .item-content .item-type { font-size: 11px; color: ${COLORS.textSecondary}; margin-bottom: 2px; }
.${NS}-panel-item .item-content .item-desc { font-size: 13px; word-break: break-all; }
.${NS}-panel-item .item-content .item-detail { font-size: 11px; color: ${COLORS.textSecondary}; margin-top: 2px; }
.${NS}-panel-item .item-del {
  flex-shrink: 0; width: 20px; height: 20px; border: none; background: none;
  cursor: pointer; color: #ccc; font-size: 14px; line-height: 20px; text-align: center;
  border-radius: 4px; transition: all 0.15s; margin-top: 2px;
}
.${NS}-panel-item .item-del:hover { background: #fff1f0; color: #f5222d; }
.${NS}-panel-empty {
  padding: 40px 20px; text-align: center; color: ${COLORS.textSecondary}; font-size: 13px;
}

/* 标注卡片（弹出浮层） */
.${NS}-card {
  position: fixed; z-index: 2147483643;
  width: 300px; background: ${COLORS.bg};
  border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  font-size: 13px; color: ${COLORS.textPrimary};
  overflow: hidden;
}
.${NS}-card-header {
  padding: 10px 14px; background: #fafafa;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid ${COLORS.border}; font-weight: 500; font-size: 13px;
}
.${NS}-card-header .card-close {
  border: none; background: none; cursor: pointer;
  font-size: 16px; color: #999; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center; border-radius: 4px;
}
.${NS}-card-header .card-close:hover { background: #f0f0f0; color: #333; }

.${NS}-card-tabs {
  display: flex; border-bottom: 1px solid ${COLORS.border};
}
.${NS}-card-tab {
  flex: 1; text-align: center; padding: 8px 0; cursor: pointer;
  font-size: 13px; color: ${COLORS.textSecondary}; position: relative;
  transition: color 0.15s; user-select: none;
}
.${NS}-card-tab:hover { color: ${COLORS.textPrimary}; }
.${NS}-card-tab.active { color: ${COLORS.primary}; font-weight: 500; }
.${NS}-card-tab.active::after {
  content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%;
  height: 2px; background: ${COLORS.primary};
}

.${NS}-card-body { padding: 14px; }
.${NS}-card-body .card-field { margin-bottom: 10px; }
.${NS}-card-body .card-field:last-child { margin-bottom: 0; }
.${NS}-card-body .card-field label {
  display: block; font-size: 12px; color: ${COLORS.textSecondary}; margin-bottom: 4px;
}
.${NS}-card-body input, .${NS}-card-body textarea {
  width: 100%; padding: 6px 10px; border: 1px solid ${COLORS.border};
  border-radius: 4px; font-size: 13px; outline: none; box-sizing: border-box;
  font-family: inherit;
}
.${NS}-card-body input:focus, .${NS}-card-body textarea:focus {
  border-color: ${COLORS.primary}; box-shadow: 0 0 0 2px rgba(22,119,255,0.12);
}
.${NS}-card-body textarea { resize: vertical; min-height: 60px; }
.${NS}-card-body .card-old-text {
  background: #f7f8fa; padding: 6px 10px; border-radius: 4px;
  font-size: 12px; color: #666; word-break: break-all;
  border: 1px solid ${COLORS.border}; margin-bottom: 8px;
}
.${NS}-card-footer {
  padding: 10px 14px; border-top: 1px solid ${COLORS.border};
  display: flex; justify-content: flex-end; gap: 6px;
}
.${NS}-card-footer button {
  padding: 5px 16px; border-radius: 4px; font-size: 13px; cursor: pointer; transition: all 0.15s;
}
.${NS}-card-footer .card-cancel {
  border: 1px solid ${COLORS.border}; background: ${COLORS.bg}; color: ${COLORS.textSecondary};
}
.${NS}-card-footer .card-cancel:hover { border-color: #999; color: ${COLORS.textPrimary}; }
.${NS}-card-footer .card-confirm {
  border: 1px solid ${COLORS.primary}; background: ${COLORS.primary}; color: #fff;
}
.${NS}-card-footer .card-confirm:hover { opacity: 0.9; }

/* 导出弹窗 */
.${NS}-overlay {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
}
.${NS}-modal {
  background: ${COLORS.bg}; border-radius: 8px; width: 600px; max-width: 90vw;
  max-height: 80vh; display: flex; flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.${NS}-modal-header {
  padding: 14px 18px; border-bottom: 1px solid ${COLORS.border};
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; font-size: 14px;
}
.${NS}-modal-header button {
  border: none; background: none; cursor: pointer; font-size: 18px; color: #999; width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center; border-radius: 4px;
}
.${NS}-modal-header button:hover { background: #f0f0f0; color: #333; }
.${NS}-modal-body {
  flex: 1; overflow-y: auto; padding: 16px 18px;
  font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
  line-height: 1.6; white-space: pre-wrap; color: #333; user-select: text;
}
.${NS}-modal-footer {
  padding: 12px 18px; border-top: 1px solid ${COLORS.border};
  display: flex; justify-content: flex-end; gap: 6px;
}
.${NS}-modal-footer button {
  padding: 5px 16px; border-radius: 4px; font-size: 13px; cursor: pointer; transition: all 0.15s;
}
.${NS}-modal-footer .modal-close {
  border: 1px solid ${COLORS.border}; background: ${COLORS.bg}; color: ${COLORS.textSecondary};
}
.${NS}-modal-footer .modal-copy {
  border: 1px solid ${COLORS.primary}; background: ${COLORS.primary}; color: #fff;
}
.${NS}-modal-footer .modal-copy:hover { opacity: 0.9; }
.${NS}-toast {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 2147483648;
  background: rgba(0,0,0,0.8); color: #fff; padding: 8px 20px; border-radius: 6px;
  font-size: 13px; transition: opacity 0.3s;
}
`;
    document.head.appendChild(style);
  }

  // ============================================================
  //  工具函数
  // ============================================================

  /** 获取元素的可读文本描述 */
  function getElementText(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      return el.placeholder || el.value || '';
    }
    if (tag === 'select') {
      return el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
    }
    if (el.textContent) {
      return el.textContent.trim().substring(0, 80);
    }
    return '';
  }

  /** 构建元素的 CSS 选择器路径 */
  function buildSelector(el) {
    if (!el || el === document.body) return 'body';
    if (el === document.documentElement) return 'html';

    const parts = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();

      // 有 id → 直接终结
      if (current.id) {
        parts.unshift('#' + CSS.escape(current.id));
        break;
      }

      // 构建标签 + 类选择器
      let selector = tag;
      if (current.className && typeof current.className === 'string') {
        const cls = current.className.trim().split(/\s+/).filter(c => c && !c.startsWith(NS));
        if (cls.length > 0) {
          selector += '.' + cls.map(c => CSS.escape(c)).join('.');
        }
      }

      // nth-of-type
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (s) => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  /** 获取 HTML 上下文（父元素 outerHTML，目标打标记） */
  function getContext(el) {
    const parent = el.parentElement;
    if (!parent) return '';

    // 临时标记
    el.setAttribute('data-annotated-target', '');
    const html = parent.outerHTML;
    el.removeAttribute('data-annotated-target');

    // 截取前 600 字符（避免过长）
    return html.length > 600 ? html.substring(0, 600) + '…' : html;
  }

  /** 生成文件名 */
  function getPageName() {
    const path = window.location.pathname;
    const file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return file;
  }

  /** Toast 提示 */
  function showToast(msg) {
    const old = document.querySelector('.' + NS + '-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = NS + '-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
  }

  // ============================================================
  //  UI：浮窗按钮
  // ============================================================
  function createToggleBtn() {
    const btn = document.createElement('div');
    btn.className = NS + '-btn';
    btn.textContent = '📌';
    btn.title = '点击进入标注模式（Shift + Click 标注元素）';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMode();
    });
    document.body.appendChild(btn);
    return btn;
  }

  // ============================================================
  //  UI：右侧标注面板
  // ============================================================
  function createPanel() {
    const panel = document.createElement('div');
    panel.className = NS + '-panel collapsed';
    panel.innerHTML =
      '<div class="' + NS + '-panel-header">' +
        '<span>📋 标注列表</span>' +
        '<div class="' + NS + '-panel-actions">' +
          '<button class="export-btn" onclick="' + NS + 'Export()">📤 导出</button>' +
          '<button onclick="' + NS + 'ClearAll()">🗑 清空</button>' +
        '</div>' +
      '</div>' +
      '<div class="' + NS + '-panel-body" id="' + NS + '-panel-body">' +
        '<div class="' + NS + '-panel-empty">暂无标注<br/>Shift + 点击页面元素开始标注</div>' +
      '</div>';
    document.body.appendChild(panel);
    return panel;
  }

  // 导出函数暴露到全局
  window[NS + 'Export'] = function () { doExport(); };
  window[NS + 'ClearAll'] = function () { clearAllAnnotations(); };
  window[NS + 'DeleteAnno'] = function (id) { deleteAnnotation(id); };

  // ============================================================
  //  UI：标注卡片
  // ============================================================
  let activeCard = null;
  let activeTab = 'text'; // 'text' | 'note'

  function showCard(target, x, y, annotation) {
    hideCard();
    pendingTarget = target;

    const id = annotation ? annotation.id : 'A' + String(nextId).padStart(2, '0');
    const oldText = getElementText(target);
    const isEdit = !!annotation;

    const card = document.createElement('div');
    card.className = NS + '-card';
    card.setAttribute('data-annotool-card', '');

    card.innerHTML =
      '<div class="' + NS + '-card-header">' +
        '<span>' + (isEdit ? '编辑 ' : '') + '标注 ' + id + '</span>' +
        '<button class="card-close" onclick="' + NS + 'HideCard()">✕</button>' +
      '</div>' +
      '<div class="' + NS + '-card-tabs">' +
        '<div class="' + NS + '-card-tab active" data-tab="text" onclick="' + NS + 'SwitchTab(\'text\')">✏️ 改文本</div>' +
        '<div class="' + NS + '-card-tab" data-tab="note" onclick="' + NS + 'SwitchTab(\'note\')">💬 写说明</div>' +
      '</div>' +
      '<div class="' + NS + '-card-body">' +
        '<div class="card-field card-text-panel">' +
          '<label>当前文本</label>' +
          '<div class="card-old-text">' + escapeHtml(oldText || '(无文本)') + '</div>' +
          '<label>修改为</label>' +
          '<input type="text" id="' + NS + '-new-text" placeholder="输入新文本…" value="' +
            (annotation && annotation.type === 'text' ? escapeHtml(annotation.newText) : '') + '" />' +
        '</div>' +
        '<div class="card-field card-note-panel ' + NS + '-hidden">' +
          '<label>修改说明</label>' +
          '<textarea id="' + NS + '-note-text" placeholder="描述需要怎么改，比如：&#10;文字改成xxx&#10;颜色改成绿色&#10;位置移到右上角…">' +
            (annotation && annotation.type === 'note' ? escapeHtml(annotation.note) : '') +
          '</textarea>' +
        '</div>' +
      '</div>' +
      '<div class="' + NS + '-card-footer">' +
        '<button class="card-cancel" onclick="' + NS + 'HideCard()">取消</button>' +
        '<button class="card-confirm" onclick="' + NS + 'ConfirmCard()">确认</button>' +
      '</div>';

    document.body.appendChild(card);
    activeCard = card;
    activeTab = 'text';

    // 定位卡片：尽量在点击位置附近，但不出视口
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let cx = x + 16;
    let cy = y + 16;

    // 先挂载，让浏览器计算尺寸
    requestAnimationFrame(function () {
      const rect = card.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;

      if (cx + cw > vw - 10) cx = x - cw - 16;
      if (cy + ch > vh - 10) cy = vh - ch - 10;
      if (cx < 10) cx = 10;
      if (cy < 10) cy = 10;

      card.style.left = cx + 'px';
      card.style.top = cy + 'px';
    });
  }

  window[NS + 'HideCard'] = function () { hideCard(); };
  window[NS + 'SwitchTab'] = function (tab) { switchCardTab(tab); };
  window[NS + 'ConfirmCard'] = function () { confirmCard(); };

  function hideCard() {
    if (activeCard) {
      activeCard.remove();
      activeCard = null;
    }
    pendingTarget = null;
  }

  function switchCardTab(tab) {
    activeTab = tab;
    if (!activeCard) return;
    const tabs = activeCard.querySelectorAll('.' + NS + '-card-tab');
    tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tab); });
    const textPanel = activeCard.querySelector('.card-text-panel');
    const notePanel = activeCard.querySelector('.card-note-panel');
    if (textPanel) textPanel.classList.toggle(NS + '-hidden', tab !== 'text');
    if (notePanel) notePanel.classList.toggle(NS + '-hidden', tab !== 'note');
  }

  function confirmCard() {
    if (!activeCard || !pendingTarget) return;

    const idInput = activeCard.querySelector('.' + NS + '-card-header span');
    const idMatch = idInput ? idInput.textContent.match(/[A-Z]\d+/) : null;
    const annoId = idMatch ? idMatch[0] : null;

    const existingAnno = annotations.find(function (a) { return a.id === annoId; });

    if (activeTab === 'text') {
      const newTextEl = document.getElementById(NS + '-new-text');
      const newText = newTextEl ? newTextEl.value.trim() : '';
      if (!newText) { showToast('请输入新文本'); return; }

      const oldText = getElementText(pendingTarget);

      if (existingAnno) {
        existingAnno.type = 'text';
        existingAnno.oldText = oldText;
        existingAnno.newText = newText;
        existingAnno.note = '';
      } else {
        annotations.push({
          id: annoId,
          type: 'text',
          oldText: oldText,
          newText: newText,
          note: '',
          selector: buildSelector(pendingTarget),
          context: getContext(pendingTarget),
          page: getPageName(),
        });
      }
    } else {
      const noteEl = document.getElementById(NS + '-note-text');
      const note = noteEl ? noteEl.value.trim() : '';
      if (!note) { showToast('请输入修改说明'); return; }

      const oldText = getElementText(pendingTarget);

      if (existingAnno) {
        existingAnno.type = 'note';
        existingAnno.oldText = oldText;
        existingAnno.note = note;
        existingAnno.newText = '';
      } else {
        annotations.push({
          id: annoId,
          type: 'note',
          oldText: oldText,
          newText: '',
          note: note,
          selector: buildSelector(pendingTarget),
          context: getContext(pendingTarget),
          page: getPageName(),
        });
      }
    }

    if (!existingAnno) {
      nextId++;
      placeBadge(pendingTarget);
    }

    hideCard();
    refreshPanel();
    removeHighlight();
    showToast(annoId + ' 标注已保存');
  }

  // ============================================================
  //  元素高亮 & 徽章
  // ============================================================

  function highlightElement(el) {
    el.classList.add(NS + '-highlight');
  }

  function removeHighlight() {
    document.querySelectorAll('.' + NS + '-highlight').forEach(function (el) {
      el.classList.remove(NS + '-highlight');
    });
  }

  function placeBadge(el) {
    // 检查是否已有徽章
    if (el.querySelector('.' + NS + '-badge')) return;

    const anno = annotations.find(function (a) {
      return buildSelector(el) === a.selector;
    });
    if (!anno) return;

    const badge = document.createElement('div');
    badge.className = NS + '-badge ' + (anno.type === 'text' ? 'text' : 'note');
    badge.textContent = anno.id;

    // 用 fixed 定位，覆盖在元素右上角
    const rect = el.getBoundingClientRect();
    badge.style.top = (rect.top - 10) + 'px';
    badge.style.left = (rect.right - 10) + 'px';

    // 滚动时更新位置
    badge.setAttribute('data-annotool-badgefor', anno.id);
    document.body.appendChild(badge);
  }

  function updateBadgePositions() {
    document.querySelectorAll('[' + NS + '-badgefor]').forEach(function (badge) {
      const id = badge.getAttribute('data-annotool-badgefor');
      const anno = annotations.find(function (a) { return a.id === id; });
      if (!anno) { badge.remove(); return; }
      // 通过选择器找元素
      const el = findElementBySelector(anno.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        badge.style.top = (rect.top - 10) + 'px';
        badge.style.left = (rect.right - 10) + 'px';
      }
    });
  }

  function findElementBySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function syncBadges() {
    // 移除所有旧徽章
    document.querySelectorAll('.' + NS + '-badge').forEach(function (b) { b.remove(); });
    // 重新为所有标注打徽章
    annotations.forEach(function (anno) {
      const el = findElementBySelector(anno.selector);
      if (el) placeBadge(el);
    });
  }

  // ============================================================
  //  面板渲染
  // ============================================================
  function refreshPanel() {
    const body = document.getElementById(NS + '-panel-body');
    if (!body) return;

    if (annotations.length === 0) {
      body.innerHTML = '<div class="' + NS + '-panel-empty">暂无标注<br/>Shift + 点击页面元素开始标注</div>';
      return;
    }

    body.innerHTML = annotations.map(function (a) {
      var typeLabel = a.type === 'text' ? '✏️ 文本修改' : '💬 修改说明';
      var desc = a.type === 'text'
        ? escapeHtml(a.oldText || '(无文本)') + ' → ' + escapeHtml(a.newText)
        : escapeHtml(a.note);
      var detail = a.type === 'text' ? '' : '目标：' + escapeHtml(a.oldText || '(无文本)');
      return '<div class="' + NS + '-panel-item">' +
        '<div class="id-badge ' + a.type + '">' + a.id + '</div>' +
        '<div class="item-content">' +
          '<div class="item-type">' + typeLabel + '</div>' +
          '<div class="item-desc">' + desc + '</div>' +
          (detail ? '<div class="item-detail">' + detail + '</div>' : '') +
        '</div>' +
        '<button class="item-del" onclick="' + NS + 'DeleteAnno(\'' + a.id + '\')" title="删除">✕</button>' +
      '</div>';
    }).join('');
  }

  // ============================================================
  //  标注操作
  // ============================================================
  function handleAnnotateClick(e) {
    if (!isActive) return;
    if (!e.shiftKey) return; // 只有 Shift+Click 才标注

    // 不标注工具本身的 UI
    var target = e.target;
    if (target.closest('.' + NS + '-btn')) return;
    if (target.closest('.' + NS + '-panel')) return;
    if (target.closest('.' + NS + '-card')) return;
    if (target.closest('.' + NS + '-overlay')) return;
    if (target.closest('.' + NS + '-badge')) return;

    e.preventDefault();
    e.stopPropagation();

    removeHighlight();
    highlightElement(target);

    // 检查该元素是否已被标注
    var sel = buildSelector(target);
    var existing = annotations.find(function (a) { return a.selector === sel; });

    if (existing) {
      // 编辑已有标注
      showCard(target, e.clientX, e.clientY, existing);
    } else {
      // 新建标注
      var id = 'A' + String(nextId).padStart(2, '0');
      showCard(target, e.clientX, e.clientY);
    }
  }

  function deleteAnnotation(id) {
    var idx = annotations.findIndex(function (a) { return a.id === id; });
    if (idx === -1) return;
    annotations.splice(idx, 1);
    syncBadges();
    refreshPanel();
    showToast(id + ' 已删除');
  }

  function clearAllAnnotations() {
    if (annotations.length === 0) return;
    annotations = [];
    nextId = 1;
    document.querySelectorAll('.' + NS + '-badge').forEach(function (b) { b.remove(); });
    refreshPanel();
    showToast('已清空所有标注');
  }

  // ============================================================
  //  导出
  // ============================================================
  function doExport() {
    if (annotations.length === 0) {
      showToast('暂无标注可导出');
      return;
    }

    var lines = [];
    lines.push('=== 标注导出 ===');
    lines.push('页面: ' + getPageName());
    lines.push('日期: ' + new Date().toLocaleString('zh-CN'));
    lines.push('标注: ' + annotations.length + ' 条');
    lines.push('');

    annotations.forEach(function (a, i) {
      if (i > 0) lines.push('────────────────────────────────');
      lines.push(a.id + ' | ' + (a.type === 'text' ? '✏️ 文本修改' : '💬 修改说明'));
      lines.push('');
      if (a.oldText) lines.push('旧文本: ' + a.oldText);
      if (a.type === 'text') {
        lines.push('新文本: ' + a.newText);
      } else {
        lines.push('说明: ' + a.note);
        lines.push('目标元素: "' + (a.oldText || '(无文本)') + '"');
      }
      lines.push('');
      lines.push('选择器:');
      lines.push(a.selector);
      lines.push('');
      lines.push('上下文:');
      lines.push(a.context);
    });

    showExportModal(lines.join('\n'));
  }

  function showExportModal(text) {
    var overlay = document.createElement('div');
    overlay.className = NS + '-overlay';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

var modalHtml = ''
      + '<div class="' + NS + '-modal">'
      + '<div class="' + NS + '-modal-header">'
      + '<span>📤 标注导出</span>'
      + '<button class="modal-x-btn" id="' + NS + '-modal-close-btn">✕</button>'
      + '</div>'
      + '<div class="' + NS + '-modal-body" id="' + NS + '-export-body">' + escapeHtml(text) + '</div>'
      + '<div class="' + NS + '-modal-footer">'
      + '<button class="modal-close" id="' + NS + '-modal-cancel-btn">关闭</button>'
      + '<button class="modal-copy" id="' + NS + '-modal-copy-btn">📋 复制</button>'
      + '</div>'
      + '</div>';
    overlay.innerHTML = modalHtml;

    // 事件绑定
    setTimeout(function () {
      var closeBtn = document.getElementById(NS + '-modal-close-btn');
      var cancelBtn = document.getElementById(NS + '-modal-cancel-btn');
      var copyBtn = document.getElementById(NS + '-modal-copy-btn');
      if (closeBtn) closeBtn.onclick = function () { overlay.remove(); };
      if (cancelBtn) cancelBtn.onclick = function () { overlay.remove(); };
      if (copyBtn) copyBtn.onclick = function () { window[NS + 'CopyExport'](); };
    }, 0);

    document.body.appendChild(overlay);
    // 存一份导出文本
    overlay.setAttribute('data-annotool-export-text', text);
  }

  window[NS + 'CopyExport'] = function () {
    var overlay = document.querySelector('.' + NS + '-overlay');
    if (!overlay) return;
    var text = overlay.getAttribute('data-annotool-export-text');
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('✅ 已复制到剪贴板');
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  };

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('✅ 已复制到剪贴板');
    } catch (e) {
      showToast('复制失败，请手动选择文本复制');
    }
    document.body.removeChild(ta);
  }

  // ============================================================
  //  模式切换
  // ============================================================
  function toggleMode() {
    isActive = !isActive;
    $.btn.classList.toggle('active', isActive);
    $.btn.title = isActive
      ? '✅ 标注模式已开启（Shift + Click 标注）'
      : '📌 点击进入标注模式';
    $.panel.classList.toggle('collapsed', !isActive);

    if (isActive) {
      showToast('📌 标注模式已开启 — Shift + 点击元素进行标注');
    } else {
      removeHighlight();
      hideCard();
      showToast('标注模式已关闭');
    }
  }

  // ============================================================
  //  转义 HTML（防止 XSS）
  // ============================================================
  var _escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/[&<>"']/g, function (c) { return _escapeMap[c] || c; });
  }

  // ============================================================
  //  事件绑定
  // ============================================================
  function bindEvents() {
    // 标注点击 - 使用 capture 先拦截
    document.addEventListener('click', handleAnnotateClick, true);

    // 更新徽章位置（滚动 + 窗口变化）
    var updateTimer = null;
    function scheduleBadgeUpdate() {
      if (!isActive) return;
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(function () {
        updateBadgePositions();
        updateTimer = null;
      }, 50);
    }
    window.addEventListener('scroll', scheduleBadgeUpdate, true);
    window.addEventListener('resize', scheduleBadgeUpdate);
  }

  // ============================================================
  //  初始化
  // ============================================================
  function init() {
    injectStyles();
    $.btn = createToggleBtn();
    $.panel = createPanel();
    bindEvents();
    console.log('[Annotool] 📌 标注工具已加载 — Shift + Click 标注元素');
  }

  // 页面加载完成后初始化
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();