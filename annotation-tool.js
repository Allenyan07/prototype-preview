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
    // 深色主题
    dark: { bg: '#1d1d1d', surface: '#2a2a2a', text: '#e0e0e0', text2: '#999', border: '#444' },
  };

  // ============================================================
  //  状态
  // ============================================================
  let isActive = false;
  let annotations = [];
  let nextId = 1;
  let pendingTarget = null; // 当前标注卡片对应的 DOM 元素
  let dragState = null; // 区域拖拽状态 { startX, startY, el, isDragging }

  function saveToStorage() {
    try { localStorage.setItem(NS + '-data', JSON.stringify({ annotations: annotations, nextId: nextId })); } catch (e) {}
  }
  function loadFromStorage() {
    try {
      var data = JSON.parse(localStorage.getItem(NS + '-data'));
      if (data && data.annotations) { annotations = data.annotations; nextId = data.nextId || 1; }
    } catch (e) {}
  }

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
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483644;
  width: 44px; height: 44px; border-radius: 50%;
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px ${COLORS.shadow};
  transition: all 0.2s, right 0.25s ease; user-select: none;
  background: ${COLORS.bg}; color: ${COLORS.textSecondary};
}
.${NS}-btn:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.18); transform: scale(1.05); }
.${NS}-btn.active { background: ${COLORS.primary}; color: #fff; right: 364px; }
.${NS}-btn .${NS}-btn-icon { font-size: 20px; line-height: 1; display: block; }

/* 高亮框 */
.${NS}-highlight {
  outline: 2px dashed ${COLORS.primary} !important;
  outline-offset: 2px !important;
}

/* 元素上标注编号徽章 */
.${NS}-badge {
  position: fixed; z-index: 2147483641;
  padding: 1px 6px; border-radius: 3px;
  font-size: 11px; font-weight: 600; line-height: 1.5;
  white-space: nowrap;
}
.${NS}-badge.text { background: ${COLORS.text}; color: ${COLORS.primary}; }
.${NS}-badge.note { background: ${COLORS.noteBg}; color: ${COLORS.note}; }
.${NS}-badge.area { background: #e6f7ff; color: #13c2c2; }
.${NS}-badge.done { background: #f6ffed; color: #52c41a; text-decoration: line-through; opacity: 0.7; }
.${NS}-badge.ignored { background: #fafafa; color: #bbb; text-decoration: line-through; opacity: 0.5; cursor: default; }
.${NS}-badge.done::after { content: ' ✓'; font-size: 9px; }
.${NS}-badge.ignored::after { content: ' ✗'; font-size: 9px; }

/* 标注 tooltip */
.${NS}-tooltip {
  position: fixed; z-index: 2147483644;
  background: #333; color: #fff; padding: 6px 10px;
  border-radius: 4px; font-size: 12px; line-height: 1.5;
  max-width: 260px; word-break: break-all;
  pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

/* 深色主题 */
.${NS}-dark .${NS}-panel,
.${NS}-dark .${NS}-card,
.${NS}-dark .${NS}-modal { background: ${COLORS.dark.surface}; color: ${COLORS.dark.text}; }
.${NS}-dark .${NS}-panel-header { border-color: ${COLORS.dark.border}; background: ${COLORS.dark.surface}; }
.${NS}-dark .${NS}-panel-item { border-color: ${COLORS.dark.border}; }
.${NS}-dark .${NS}-panel-item:hover { background: #333; }
.${NS}-dark .${NS}-panel-actions button { background: ${COLORS.dark.surface}; border-color: ${COLORS.dark.border}; color: ${COLORS.dark.text2}; }
.${NS}-dark .${NS}-panel-empty { color: ${COLORS.dark.text2}; }
.${NS}-dark .${NS}-card-header { background: ${COLORS.dark.surface}; border-color: ${COLORS.dark.border}; }
.${NS}-dark .${NS}-card-body input,
.${NS}-dark .${NS}-card-body textarea,
.${NS}-dark .${NS}-card-body select.card-status { background: ${COLORS.dark.bg}; border-color: ${COLORS.dark.border}; color: ${COLORS.dark.text}; }
.${NS}-dark .${NS}-card-body .card-old-text { background: ${COLORS.dark.bg}; border-color: ${COLORS.dark.border}; color: ${COLORS.dark.text2}; }
.${NS}-dark .${NS}-card-footer { border-color: ${COLORS.dark.border}; }
.${NS}-dark .${NS}-card-footer .card-cancel { background: ${COLORS.dark.surface}; border-color: ${COLORS.dark.border}; color: ${COLORS.dark.text2}; }
.${NS}-dark .${NS}-collapse-tab { background: ${COLORS.dark.surface}; border-color: ${COLORS.dark.border}; color: ${COLORS.dark.text2}; }
.${NS}-dark .${NS}-tooltip { background: #555; color: #fff; }

/* 区域选择框 */
.${NS}-sel-rect {
  position: fixed; z-index: 2147483645;
  border: 2px dashed ${COLORS.primary};
  background: rgba(22,119,255,0.08);
  pointer-events: none;
}

/* 右侧标注面板 */
.${NS}-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483642;
  width: 340px; background: ${COLORS.bg};
  box-shadow: -2px 0 12px ${COLORS.shadow};
  display: flex; flex-direction: column;
  transition: width 0.25s ease;
  font-size: 13px; color: ${COLORS.textPrimary};
}
.${NS}-panel.collapsed { display: none; }

/* 页面内容右推 */
body.${NS}-shift { padding-right: 340px !important; transition: padding-right 0.25s ease; }

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
.${NS}-panel-item .id-badge.area { background: #e6f7ff; color: #13c2c2; }
.${NS}-panel-item .item-content { flex: 1; min-width: 0; }
.${NS}-panel-item .item-content .item-type { font-size: 11px; color: ${COLORS.textSecondary}; margin-bottom: 2px; }
.${NS}-panel-item .item-content .item-change,
.${NS}-panel-item .item-content .item-note,
.${NS}-panel-item .item-content .item-area {
  font-size: 13px; word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.4;
}
.${NS}-panel-item .item-content .item-note,
.${NS}-panel-item .item-content .item-area { font-size: 11px; color: ${COLORS.textSecondary}; margin-top: 2px; }
.${NS}-panel-item .item-content .item-empty { font-size: 12px; color: ${COLORS.textSecondary}; }
.${NS}-panel-item .item-del {
  flex-shrink: 0; width: 20px; height: 20px; border: none; background: none;
  cursor: pointer; color: #ccc; font-size: 14px; line-height: 20px; text-align: center;
  border-radius: 4px; transition: all 0.15s; margin-top: 2px;
}
.${NS}-panel-item .item-del:hover { background: #fff1f0; color: #f5222d; }

/* 标注条目行布局 */
.${NS}-panel-item .item-row {
  display: flex; gap: 6px; font-size: 12px; line-height: 1.6; margin-bottom: 2px;
}
.${NS}-panel-item .item-row:last-child { margin-bottom: 0; }
.${NS}-panel-item .item-icon {
  flex-shrink: 0; width: 22px; font-size: 13px; text-align: center; line-height: 1.6;
}
.${NS}-panel-item .item-val { flex: 1; min-width: 0; word-break: break-all; color: #333; }
.${NS}-panel-item .item-text {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.5;
}
.${NS}-panel-item .item-val.old-text { color: #999; }
.${NS}-panel-item .item-val.new-text { color: #1677ff; font-weight: 500; }
.${NS}-panel-item .item-val.note-text { color: #666; }
.${NS}-dark .${NS}-panel-item .item-val { color: #ddd; }
.${NS}-dark .${NS}-panel-item .item-val.old-text { color: #666; }
.${NS}-dark .${NS}-panel-item .item-val.new-text { color: #69b1ff; }

.${NS}-panel-empty {
  padding: 40px 20px; text-align: center; color: ${COLORS.textSecondary}; font-size: 13px;
}

/* 按页面分组表头 */
.${NS}-group-header {
  padding: 6px 12px; font-size: 12px; font-weight: 600;
  background: #e8f4fd; color: #1677ff; border-bottom: 1px solid #bae0ff;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 1;
}
.${NS}-dark .${NS}-group-header { background: #1f2a3f; color: #69b1ff; border-color: #2b3a55; }
.${NS}-group-header .group-count { font-weight: 400; font-size: 11px; color: #69b1ff; }

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
.${NS}-card-body select.card-status {
  width: 100%; padding: 6px 10px; border: 1px solid ${COLORS.border};
  border-radius: 4px; font-size: 13px; outline: none; box-sizing: border-box;
  background: ${COLORS.bg}; cursor: pointer;
}
.${NS}-card-body select.card-status:focus { border-color: ${COLORS.primary}; box-shadow: 0 0 0 2px rgba(22,119,255,0.12); }
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

    // 克隆父元素，在克隆上做标记（避免污染真实 DOM）
    const clone = parent.cloneNode(true);
    // 找到克隆中对应的目标元素
    var targetClone;
    for (var i = 0; i < clone.children.length; i++) {
      if (i === Array.from(parent.children).indexOf(el)) {
        targetClone = clone.children[i];
        break;
      }
    }
    if (targetClone) {
      targetClone.removeAttribute('class');
      targetClone.removeAttribute('data-annotated-target');
      targetClone.setAttribute('data-target', '');
    }

    const html = clone.outerHTML;
    // 截取前 600 字符（避免过长）
    return html.length > 600 ? html.substring(0, 600) + '…' : html;
  }

  /** 生成文件名 */
  function getPageName() {
    const path = window.location.pathname;
    const file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    try { return decodeURIComponent(file); } catch(e) { return file; }
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
    btn.innerHTML = '<span class="' + NS + '-btn-icon">📌</span>';
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
        '<div class="' + NS + '-panel-empty">暂无标注<br/>Shift + 点击标注元素 / Shift + 拖拽框选区域</div>' +
      '</div>';
    document.body.appendChild(panel);
    return panel;
  }

  // 导出函数暴露到全局
  window[NS + 'Export'] = function () { doExport(); };
  window[NS + 'ClearAll'] = function () { clearAllAnnotations(); };
  window[NS + 'DeleteAnno'] = function (id) { deleteAnnotation(id); };

  /** 从面板点击编辑标注 */
  window[NS + 'EditAnnotation'] = function (id, event) {
    if (event) event.stopPropagation();
    var anno = annotations.find(function (a) { return a.id === id; });
    if (!anno) return;
    // 区域标注：不支持从面板编辑，提示用户在页面上重新框选
    if (anno.area) {
      showToast('区域标注暂不支持从面板编辑，请在页面上 Shift+拖拽重新标注');
      return;
    }
    var el = findElementBySelector(anno.selector);
    if (!el) { showToast('找不到该标注对应的页面元素'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () {
      removeHighlight();
      highlightElement(el);
      var rect = el.getBoundingClientRect();
      showCard(el, rect.right, rect.top, anno);
    }, 300);
  };

  // ============================================================
  //  UI：标注卡片
  // ============================================================
  let activeCard = null;
let nsPrefix = '';
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
      '<div class="' + NS + '-card-body">' +
        '<div class="card-field">' +
          '<label>当前文本</label>' +
          '<div class="card-old-text">' + escapeHtml(oldText || '(无文本)') + '</div>' +
          '<label style="margin-top:8px;">修改为</label>' +
          '<input type="text" id="' + NS + '-new-text" placeholder="直接改文字…" value="' +
            (annotation && annotation.newText ? escapeHtml(annotation.newText) : '') + '" />' +
        '</div>' +
        '<div class="card-field" style="margin-top:10px;">' +
          '<label>修改说明 <span style="color:#999;font-weight:400;font-size:11px;">（改颜色、位置、交互等）</span></label>' +
          '<textarea id="' + NS + '-note-text" placeholder="描述需要怎么改…">' +
            (annotation && annotation.note ? escapeHtml(annotation.note) : '') +
          '</textarea>' +
        '</div>' +
      '</div>' +
      '<div class="' + NS + '-card-footer">' +
        '<button class="card-cancel" onclick="' + NS + 'HideCard()">取消</button>' +
        '<button class="card-confirm" onclick="' + NS + 'ConfirmCard()">确认</button>' +
      '</div>';

document.body.appendChild(card);
    activeCard = card;

    // 收起 tab 面板，默认显示改文本
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

  /** 区域标注卡片 */
  function showAreaCard(target, x, y, area) {
    hideCard();
    pendingTarget = target;
    var id = 'A' + String(nextId).padStart(2, '0');
    var card = document.createElement('div');
    card.className = NS + '-card';
    card.setAttribute('data-annotool-card', '');
    card.innerHTML =
      '<div class="' + NS + '-card-header">' +
        '<span>区域标注 ' + id + '</span>' +
        '<button class="card-close" onclick="' + NS + 'HideCard()">✕</button>' +
      '</div>' +
      '<div class="' + NS + '-card-body">' +
        '<div class="card-field">' +
          '<label>选择区域</label>' +
          '<div class="card-old-text">(' + area.width + ' × ' + area.height + ' px)</div>' +
        '</div>' +
        '<div class="card-field">' +
          '<label>修改说明</label>' +
          '<textarea id="' + NS + '-note-text" placeholder="描述这个区域的改动…"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="' + NS + '-card-footer">' +
        '<button class="card-cancel" onclick="' + NS + 'HideCard()">取消</button>' +
        '<button class="card-confirm" onclick="' + NS + 'ConfirmArea(\'' + id + '\',' + area.left + ',' + area.top + ',' + area.width + ',' + area.height + ')">确认</button>' +
      '</div>';
    document.body.appendChild(card);
    activeCard = card;
    var vw = window.innerWidth, vh = window.innerHeight;
    var cx = x + 16, cy = y + 16;
    requestAnimationFrame(function () {
      var rect = card.getBoundingClientRect();
      if (cx + rect.width > vw - 10) cx = x - rect.width - 16;
      if (cy + rect.height > vh - 10) cy = vh - rect.height - 10;
      if (cx < 10) cx = 10; if (cy < 10) cy = 10;
      card.style.left = cx + 'px'; card.style.top = cy + 'px';
    });
  }

  window[NS + 'ConfirmArea'] = function (id, left, top, width, height) {
    var noteEl = document.getElementById(NS + '-note-text');
    var note = noteEl ? noteEl.value.trim() : '';
    if (!note) { showToast('请填写区域标注说明'); return; }
    var data = {
      id: id, note: note, area: { left: left, top: top, width: width, height: height },
      page: getPageName(), status: 'pending'
    };
    annotations.push(data);
    nextId++;
    saveToStorage();
    refreshPanel();
    hideCard();
    removeHighlight();
    // 移除临时占位元素
    if (pendingTarget && pendingTarget.parentNode) pendingTarget.parentNode.removeChild(pendingTarget);
    pendingTarget = null;
    showToast('区域标注 ' + id + ' 已保存');
  };

  window[NS + 'HideCard'] = function () { hideCard(); };
  window[NS + 'ConfirmCard'] = function () { confirmCard(); };

  function hideCard() {
    if (activeCard) {
      activeCard.remove();
      activeCard = null;
    }
    pendingTarget = null;
  }

  function confirmCard() {
    if (!activeCard || !pendingTarget) return;

    const idInput = activeCard.querySelector('.' + NS + '-card-header span');
    const idMatch = idInput ? idInput.textContent.match(/[A-Z]\d+/) : null;
    const annoId = idMatch ? idMatch[0] : null;

    const newTextEl = document.getElementById(NS + '-new-text');
    const noteEl = document.getElementById(NS + '-note-text');
    const newText = newTextEl ? newTextEl.value.trim() : '';
    const note = noteEl ? noteEl.value.trim() : '';

    if (!newText && !note) { showToast('请填写修改文本或修改说明'); return; }

    const oldText = getElementText(pendingTarget);
    const existingAnno = annotations.find(function (a) { return a.id === annoId; });

    var data = {
      id: annoId,
      oldText: oldText,
      newText: newText,
      note: note,
      selector: buildSelector(pendingTarget),
      context: getContext(pendingTarget),
      page: getPageName(),
      status: 'pending',
    };

    if (existingAnno) {
      existingAnno.oldText = data.oldText;
      existingAnno.newText = data.newText;
      existingAnno.note = data.note;
    } else {
      annotations.push(data);
      nextId++;
      placeBadge(pendingTarget);
    }

    saveToStorage();
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
    badge.className = NS + '-badge ' + (anno.newText ? 'text' : 'note');
    badge.textContent = anno.id;
    badge.style.cursor = 'pointer';
    badge.title = '点击编辑 ' + anno.id;

    // 用 fixed 定位，覆盖在元素右上角
    const rect = el.getBoundingClientRect();
    badge.style.top = (rect.top - 10) + 'px';
    badge.style.left = (rect.right - 10) + 'px';

    // 点击徽章 = 编辑该标注
    badge.addEventListener('click', function (e) {
      e.stopPropagation();
      var target = findElementBySelector(anno.selector);
      if (target) {
        removeHighlight();
        highlightElement(target);
        showCard(target, e.clientX, e.clientY, anno);
      }
    });

    // 滚动时更新位置
    badge.setAttribute('data-annotool-badgefor', anno.id);
    document.body.appendChild(badge);
  }

  function updateBadgePositions() {
    document.querySelectorAll('[data-' + NS + '-badgefor]').forEach(function (badge) {
      const id = badge.getAttribute('data-' + NS + '-badgefor');
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
    document.querySelectorAll('.' + NS + '-badge').forEach(function (b) { b.remove(); });
    annotations.forEach(function (anno) {
      if (!anno.selector) return; // 区域标注没有选择器，跳过
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
      body.innerHTML = '<div class="' + NS + '-panel-empty">暂无标注<br/>Shift + 点击标注元素 / Shift + 拖拽框选区域</div>';
      return;
    }

body.innerHTML = (function () {
      // 按页面分组
      var groups = {};
      annotations.forEach(function (a) {
        var page = a.page || '未知页面';
        if (!groups[page]) groups[page] = [];
        groups[page].push(a);
      });

      var html = '';
      var pageKeys = Object.keys(groups);
      pageKeys.forEach(function (page) {
        var items = groups[page];
        // 分组表头
        html += '' +
          '<div class="' + NS + '-group-header">' +
            '<span>📄 ' + escapeHtml(page) + '</span>' +
            '<span class="group-count">' + items.length + ' 条</span>' +
          '</div>';

        items.forEach(function (a) {
          var badgeClass = a.newText ? 'text' : (a.area ? 'area' : 'note');
          var contentHtml = '' +
            '<div class="item-row">' +
              '<span class="item-icon">📄</span>' +
              '<span class="item-val old-text"><div class="item-text">' + escapeHtml((a.oldText || '(无文本)').substring(0, 50)) + '</div></span>' +
            '</div>' +
            '<div class="item-row">' +
              '<span class="item-icon">✏️</span>' +
              '<span class="item-val new-text"><div class="item-text">' + escapeHtml(a.newText || '(未填写)') + '</div></span>' +
            '</div>';

          if (a.note) {
            contentHtml += '<div class="item-row">' +
              '<span class="item-icon">💬</span>' +
              '<span class="item-val"><div class="item-text">' + escapeHtml(a.note) + '</div></span>' +
            '</div>';
          }
          if (a.area) {
            contentHtml += '<div class="item-row">' +
              '<span class="item-icon">📐</span>' +
              '<span class="item-val">' + a.area.width + '×' + a.area.height + '</span>' +
            '</div>';
          }

          html += '' +
            '<div class="' + NS + '-panel-item"' + (a.selector ? ' onclick="' + NS + 'EditAnnotation(\'' + escapeHtml(a.id) + '\', event)"' : '') + ' style="cursor:' + (a.selector ? 'pointer' : 'default') + ';">' +
              '<div class="id-badge ' + badgeClass + '">' + escapeHtml(a.id) + '</div>' +
              '<div class="item-content">' + contentHtml + '</div>' +
              '<button class="item-del" onclick="event.stopPropagation();' + NS + 'DeleteAnno(\'' + escapeHtml(a.id) + '\')" title="删除">✕</button>' +
            '</div>';
        });
      });
      return html;
    })();
  }

  // ============================================================
  //  标注操作
  // ============================================================
  function handleAnnotateClick(e) {
    if (!isActive) return;
    if (!e.shiftKey) return;
    // 如果是拖拽标注（区域选择跳过）
    if (dragState && dragState.isDragging) { dragState = null; return; }
    // 移除任何残留的选择框
    var oldRect = document.querySelector('.' + NS + '-sel-rect');
    if (oldRect) oldRect.remove();

    // 不标注工具本身的 UI
    var target = e.target;
    if (target.closest('.' + NS + '-btn')) return;
    if (target.closest('.' + NS + '-panel')) return;
    if (target.closest('.' + NS + '-card')) return;
    if (target.closest('.' + NS + '-overlay')) return;

    // 点击徽章 → 由徽章自己的 click 事件处理（编辑标注），不拦截
    if (target.closest('.' + NS + '-badge')) return;

    e.preventDefault();
    e.stopPropagation();

    removeHighlight();
    highlightElement(target);

    // 检查该元素是否已被标注（只检查元素标注，跳过区域标注）
    var sel = buildSelector(target);
    var existing = annotations.find(function (a) { return a.selector === sel && !a.area; });

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
    saveToStorage();
    syncBadges();
    refreshPanel();
    showToast(id + ' 已删除');
  }

  function clearAllAnnotations() {
    if (annotations.length === 0) return;
    annotations = [];
    nextId = 1;
    saveToStorage();
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
    lines.push('=== 标注导出（按页面分组） ===');
    lines.push('日期: ' + new Date().toLocaleString('zh-CN'));
    lines.push('总计: ' + annotations.length + ' 条');
    lines.push('');

    // 按页面分组
    var groups = {};
    annotations.forEach(function (a) {
      var page = a.page || '未知页面';
      if (!groups[page]) groups[page] = [];
      groups[page].push(a);
    });

    var pageKeys = Object.keys(groups);
    pageKeys.forEach(function (page, pi) {
      if (pi > 0) lines.push('');
      var items = groups[page];
      lines.push('══════ 『' + page + '』 ══════（' + items.length + ' 条）');
      lines.push('');

      items.forEach(function (a, i) {
        if (i > 0) lines.push('────────────────────────');
        lines.push('  【' + a.id + '】');
        lines.push('  原本内容：' + (a.oldText || '(无文本)'));
        lines.push('  修改后：' + (a.newText || '(未填写)'));
        if (a.note) {
          lines.push('  修改说明：' + a.note);
        }
        if (a.area) {
          lines.push('  区域：(' + Math.round(a.area.left) + ', ' + Math.round(a.area.top) + ') → (' + Math.round(a.area.left + a.area.width) + ', ' + Math.round(a.area.top + a.area.height) + ')');
          lines.push('  尺寸：' + Math.round(a.area.width) + ' × ' + Math.round(a.area.height) + ' px');
        }
        if (a.selector) {
          lines.push('  选择器：' + a.selector);
        }
        if (a.context) {
          lines.push('  上下文：' + a.context);
        }
        lines.push('');
      });
    });

    lines.push('=== 导出结束 ===');
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
      ? '✅ 标注模式已开启（Shift+Click 标注 / Shift+拖拽框选区域）'
      : '📌 点击进入标注模式';
    $.panel.classList.toggle('collapsed', !isActive);
    $.panel.dataset.annotoolActive = isActive ? 'true' : 'false';
    if (isActive) {
      document.body.classList.add(NS + '-shift');
      syncBadges();
      showToast('📌 标注模式已开启 — Shift+Click 标注 / Shift+拖拽框选区域');
    } else {
      document.body.classList.remove(NS + '-shift');
      removeHighlight();
      hideCard();
      document.querySelectorAll('.' + NS + '-badge').forEach(function (b) { b.remove(); });
      showToast('标注模式已关闭');
    }
    // Chrome 扩展桥接：通知 background 标注模式状态变化
    try {
      document.dispatchEvent(new CustomEvent('annotool-extension-state', {
        detail: { active: isActive }
      }));
    } catch(e) {}
  };

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

    // 区域拖拽（Shift + 拖拽）
    document.addEventListener('mousedown', function (e) {
      if (!isActive || !e.shiftKey) return;
      if (e.target.closest('.' + NS + '-btn,.' + NS + '-panel,.' + NS + '-card,.' + NS + '-overlay,.' + NS + '-badge')) return;
      dragState = { startX: e.clientX, startY: e.clientY, el: null, isDragging: false };
    }, true);
    document.addEventListener('mousemove', function (e) {
      if (!dragState || !e.shiftKey) { if (dragState) dragState.isDragging = false; return; }
      var dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // 抖动阈值
      dragState.isDragging = true;
      // 更新选择框
      var rect = document.querySelector('.' + NS + '-sel-rect');
      if (!rect) { rect = document.createElement('div'); rect.className = NS + '-sel-rect'; document.body.appendChild(rect); }
      var l = Math.min(dragState.startX, e.clientX), t = Math.min(dragState.startY, e.clientY);
      var w = Math.abs(dx), h = Math.abs(dy);
      rect.style.left = l + 'px'; rect.style.top = t + 'px';
      rect.style.width = w + 'px'; rect.style.height = h + 'px';
    }, true);
    document.addEventListener('mouseup', function (e) {
      if (!dragState || !dragState.isDragging || !e.shiftKey) { dragState = null; return; }
      e.preventDefault(); e.stopPropagation();
      var dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
      var l = Math.min(dragState.startX, e.clientX), t = Math.min(dragState.startY, e.clientY);
      var w = Math.abs(dx), h = Math.abs(dy);
      // 移除选择框
      var oldRect = document.querySelector('.' + NS + '-sel-rect');
      if (oldRect) oldRect.remove();
      var selEl = document.createElement('div');
      selEl.style.position = 'fixed'; selEl.style.left = l + 'px'; selEl.style.top = t + 'px';
      selEl.style.width = w + 'px'; selEl.style.height = h + 'px';
      selEl.style.pointerEvents = 'none';
      document.body.appendChild(selEl);
      removeHighlight();
      highlightElement(selEl);
      var area = { left: l, top: t, width: w, height: h };
      showAreaCard(selEl, e.clientX, e.clientY, area);
      dragState = null;
    }, true);

    // 键盘快捷键
    document.addEventListener('keydown', function (e) {
      if (!isActive) return;
      if (e.key === 'Escape') { hideCard(); removeHighlight(); }
      if (e.key === 'Enter' && activeCard) {
        var confirmBtn = activeCard.querySelector('.card-confirm');
        if (confirmBtn) confirmBtn.click();
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault(); doExport();
      }
    });

    // 更新徽章位置（滚动 + 窗口变化）
    var rafId = null;
    function scheduleBadgeUpdate() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function () {
        updateBadgePositions();
        rafId = null;
      });
    }
    window.addEventListener('scroll', scheduleBadgeUpdate, true);
    window.addEventListener('resize', scheduleBadgeUpdate);
    // 捕获延时滚动（如折叠动画结束后）
    var delayedUpdate = null;
    document.addEventListener('scroll', function () {
      if (delayedUpdate) clearTimeout(delayedUpdate);
      delayedUpdate = setTimeout(function () { updateBadgePositions(); delayedUpdate = null; }, 200);
    }, true);
  }

  // ============================================================
  //  初始化
  // ============================================================
  function init() {
    injectStyles();
    $.btn = createToggleBtn();
    $.panel = createPanel();
    bindEvents();
    // 恢复持久化的标注
    loadFromStorage();
    if (annotations.length > 0) { refreshPanel(); }
    // 深色主题检测
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.classList.add(NS + '-dark');
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      document.body.classList.toggle(NS + '-dark', e.matches);
    });
    console.log('[Annotool] 📌 标注工具已加载 — Shift + Click 标注元素 / Shift + 拖拽框选区域');
    // Chrome 扩展桥接：监听来自 content-bridge 的切换命令
    document.addEventListener('annotool-extension-toggle', function () {
      toggleMode();
    });
  }

  // 页面加载完成后初始化
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();