/**
 * 姓名練習簿與生字字帖生成核心 (Worksheet Generator)
 * 負責產生高解析度 SVG 田字格/米字格、筆順逐步分解、描紅習寫與 A4 排版
 */

class WorksheetGenerator {
  constructor() {
    this.defaultOptions = {
      // 排版與版面設定
      paperOrientation: 'portrait', // 'portrait' (直向) 或 'landscape' (橫向)
      colsPerRow: 12,              // 每行格子數（相片中為 12 格）
      gridType: 'tianzi',          // 'tianzi' (田字格), 'mizi' (米字格), 'cross' (十字格), 'box' (方格)
      gridColor: '#d63031',        // 格線色彩：教學紅 '#d63031', 灰色 '#888888', 黑色 '#222222', 綠色 '#27ae60'
      lineDash: 'dashed',          // 內部分割線：'dashed' (虛線) 或 'dotted' (點線)
      
      // 字形與筆畫色彩
      demoCharColor: '#111111',    // 首格示範字顏色（黑）
      traceColor: '#b0b0b0',       // 描紅/分解筆劃淺灰色（適合鉛筆覆寫）
      highlightLatestStroke: false,// 逐步分解時是否特別標示最新一筆（例如以紅色或深黑突出新筆畫）
      latestStrokeColor: '#d63031',// 最新一筆的突顯顏色
      
      // 練習模式與內容結構
      layoutMode: 'decomposition', // 'decomposition' (逐字分解模式 - 如照片), 'continuous' (姓名連寫模式), 'hybrid' (綜合模式)
      includeDecomposition: true,  // 是否包含筆順分解行
      includeTraceRow: true,       // 是否包含全字描紅行
      includeBlankRow: true,       // 是否包含空白自主書寫行
      emptyBoxFill: 'trace',       // 當分解格提前結束時，剩餘格子填入：'trace' (填滿描紅字) 或 'blank' (空白)
      
      // 頁面資訊與抬頭
      schoolTitle: '生字練習',
      showStudentHeader: true,     // 是否顯示 班級/座號/姓名 標題列
      gradeClassText: '____年____班',
      showDate: true,
      showScore: true,

      // 白板卡專屬設定
      whiteboardBoxType: 'trace_and_blank', // 'trace_and_blank' (大描紅+大空白) 或 'trace_only' (純大描紅)
      whiteboardGuideStyle: 'hollow_guide', // 'hollow_guide' (空心字+虛線箭頭+數字), 'trace_numbered', 'trace_plain'
      whiteboardTrackColor: '#2563eb',     // 導引虛線與箭頭顏色 (預設藍色，如使用者圖片)
      whiteboardNumberColor: '#dc2626',    // 起筆數字顏色 (預設紅色，如使用者圖片)
      showStrokeNumbersOnChar: true,        // 是否在大字上標示起筆順序號碼
      showTrackWithArrow: true,             // 是否顯示筆順中心虛線與方向箭頭
      showStrokeHintStrip: true             // 是否在旁邊顯示筆畫順序提示條
    };
  }

  /**
   * 建立單一格子的 SVG 元素 (包含田字格/米字格底紋與文字筆畫)
   * @param {Object} config
   * @param {Array} config.strokes 所有筆畫陣列
   * @param {number} config.drawStrokeCount 繪製筆畫數量 (0 代表空白格, strokes.length 代表全字)
   * @param {string} config.fillColor 預設填色
   * @param {string} config.activeStrokeColor 最新一筆的填色 (可選)
   * @param {boolean} config.showStrokeNumbers 是否在起筆處標示數字
   * @param {string} config.guideStyle 導引樣式 ('none', 'hollow_guide')
   * @param {string} config.trackColor 虛線與箭頭色彩
   * @param {string} config.numberColor 起筆數字色彩
   * @param {boolean} config.showArrow 是否顯示箭頭
   * @param {boolean} config.showTrack 是否顯示虛線
   * @param {Object} options 全局設定
   * @returns {string} SVG 標籤字串
   */
  createGridSvg({
    strokes = [],
    drawStrokeCount = 0,
    fillColor = '#111',
    activeStrokeColor = null,
    isDemo = false,
    showStrokeNumbers = false,
    guideStyle = 'none',
    trackColor = '#2563eb',
    numberColor = '#dc2626',
    showArrow = true,
    showTrack = true
  }, options) {
    const size = 2048; // 使用教育部標準字體的內部坐標系
    const half = size / 2;
    const gridColor = options.gridColor || '#d63031';
    const gridType = options.gridType || 'tianzi';
    const dash = options.lineDash === 'dotted' ? '16,24' : '32,32';

    // 0. 定義箭頭 Marker (供筆順導引線使用)
    let defs = '';
    const markerId = 'arrow_' + Math.random().toString(36).substring(2, 9);
    if (guideStyle === 'hollow_guide' && showArrow) {
      defs = `
        <defs>
          <marker id="${markerId}" viewBox="0 0 12 12" refX="8" refY="6" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M 0 1.5 L 10 6 L 0 10.5 L 2.5 6 z" fill="${trackColor}" />
          </marker>
        </defs>
      `;
    }

    // 1. 底紋格線
    let innerLines = '';
    if (gridType === 'tianzi' || gridType === 'mizi') {
      innerLines += `<line x1="0" y1="${half}" x2="${size}" y2="${half}" stroke="${gridColor}" stroke-width="12" stroke-dasharray="${dash}" opacity="0.7"/>`;
      innerLines += `<line x1="${half}" y1="0" x2="${half}" y2="${size}" stroke="${gridColor}" stroke-width="12" stroke-dasharray="${dash}" opacity="0.7"/>`;
    }
    if (gridType === 'mizi') {
      innerLines += `<line x1="0" y1="0" x2="${size}" y2="${size}" stroke="${gridColor}" stroke-width="10" stroke-dasharray="${dash}" opacity="0.45"/>`;
      innerLines += `<line x1="${size}" y1="0" x2="0" y2="${size}" stroke="${gridColor}" stroke-width="10" stroke-dasharray="${dash}" opacity="0.45"/>`;
    }
    if (gridType === 'cross') {
      innerLines += `<line x1="0" y1="${half}" x2="${size}" y2="${half}" stroke="${gridColor}" stroke-width="14" opacity="0.6"/>`;
      innerLines += `<line x1="${half}" y1="0" x2="${half}" y2="${size}" stroke="${gridColor}" stroke-width="14" opacity="0.6"/>`;
    }

    // 2. 外邊框
    const border = `<rect x="6" y="6" width="${size - 12}" height="${size - 12}" fill="none" stroke="${gridColor}" stroke-width="16"/>`;

    // 3. 筆劃向量 Path 與導引層
    let paths = '';
    const count = Math.min(drawStrokeCount, strokes.length);

    if (guideStyle === 'hollow_guide') {
      // ===== 空心外框字 + 筆順中心虛線 + 方向箭頭 + 起筆數字 (如使用者附圖) =====
      
      // 3.1 繪製空心外框線 (Hollow Outline)
      if (strokes && count > 0) {
        for (let i = 0; i < count; i++) {
          paths += `<path d="${strokes[i].outline}" fill="none" stroke="#2d3748" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
      }

      // 3.2 繪製筆順中心導引虛線與箭頭 (Dashed Track with Arrowhead)
      if (strokes && count > 0 && showTrack) {
        for (let i = 0; i < count; i++) {
          const pts = strokes[i].track;
          if (pts && pts.length >= 2) {
            const trimmed = this.trimTrackPolyline(pts, 40, 10);
            if (trimmed.length >= 2) {
              let trackD = `M ${trimmed[0].x.toFixed(1)} ${trimmed[0].y.toFixed(1)}`;
              for (let p = 1; p < trimmed.length; p++) {
                trackD += ` L ${trimmed[p].x.toFixed(1)} ${trimmed[p].y.toFixed(1)}`;
              }
              paths += `<path d="${trackD}" fill="none" stroke="${trackColor}" stroke-width="10" stroke-dasharray="24,20" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${markerId})"/>`;
            }
          }
        }
      }

      // 3.3 繪製紅色起筆順序號碼 (Red Starting Point Numbers)
      if (strokes && count > 0 && showStrokeNumbers) {
        for (let i = 0; i < count; i++) {
          const pts = strokes[i].track;
          if (pts && pts.length > 0) {
            const p0 = pts[0];
            paths += `
              <text x="${p0.x}" y="${p0.y}" fill="${numberColor}" font-size="66" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="central" stroke="#ffffff" stroke-width="8" paint-order="stroke fill">${i + 1}</text>
            `;
          }
        }
      }

    } else {
      // ===== 標準實心 / 描紅模式 =====
      if (strokes && count > 0) {
        for (let i = 0; i < count; i++) {
          const isLatest = (i === count - 1) && (count < strokes.length) && !isDemo;
          const col = (isLatest && activeStrokeColor) ? activeStrokeColor : fillColor;
          paths += `<path d="${strokes[i].outline}" fill="${col}" stroke="${col}" stroke-width="4" stroke-linejoin="round"/>`;
        }
      }

      // 起筆順序圓圈數字標記 (① ② ③)
      if (showStrokeNumbers && strokes && count > 0) {
        for (let i = 0; i < count; i++) {
          if (strokes[i].track && strokes[i].track.length > 0) {
            const pt = strokes[i].track[0];
            const r = 58;
            paths += `
              <g class="stroke-number-tag">
                <circle cx="${pt.x}" cy="${pt.y}" r="${r}" fill="#ef4444" stroke="#ffffff" stroke-width="10"/>
                <text x="${pt.x}" y="${pt.y + 19}" font-size="52" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>
              </g>
            `;
          }
        }
      }
    }

    return `<svg class="grid-svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <rect width="${size}" height="${size}" fill="#ffffff"/>
      ${innerLines}
      ${border}
      ${paths}
    </svg>`;
  }

  /**
   * 依弧長修剪筆順中心軌跡折線，使起點避開起筆數字、終點穩定指向筆畫收筆方向
   */
  trimTrackPolyline(pts, startTrim = 40, endTrim = 10) {
    if (!pts || pts.length < 2) return pts || [];
    const n = pts.length;
    const cumLen = new Float64Array(n);
    cumLen[0] = 0;
    for (let i = 1; i < n; i++) {
      cumLen[i] = cumLen[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    const total = cumLen[n - 1];
    if (total < 1e-3) return [pts[0], pts[n - 1]];

    const dStart = Math.min(startTrim, total * 0.25);
    const dEnd = Math.max(total - endTrim, total * 0.75);

    const pointAtDist = (d) => {
      if (d <= 0) return { x: pts[0].x, y: pts[0].y };
      if (d >= total) return { x: pts[n - 1].x, y: pts[n - 1].y };
      for (let i = 1; i < n; i++) {
        if (cumLen[i] >= d) {
          const segLen = cumLen[i] - cumLen[i - 1];
          const t = segLen > 1e-5 ? (d - cumLen[i - 1]) / segLen : 0;
          return {
            x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
            y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t
          };
        }
      }
      return { x: pts[n - 1].x, y: pts[n - 1].y };
    };

    const out = [pointAtDist(dStart)];
    // 終點前保留約 25 單位作為平滑切線方向段，使箭頭方向穩定不抖動
    const dPreEnd = Math.max(dStart + 5, dEnd - 25);
    for (let i = 1; i < n - 1; i++) {
      if (cumLen[i] > dStart + 8 && cumLen[i] < dPreEnd - 8) {
        out.push({ x: pts[i].x, y: pts[i].y });
      }
    }
    if (dPreEnd > dStart + 10) {
      out.push(pointAtDist(dPreEnd));
    }
    out.push(pointAtDist(dEnd));
    return out;
  }

  /**
   * 產生單一國字的「筆畫逐步分解」行與習寫行 (如使用者相片展示之兩列排版)
   * @param {Object} strokeData 教育部解析之國字資料 (含 strokes)
   * @param {Object} options 使用者排版選項
   * @returns {HTMLElement}
   */
  renderCharacterSection(strokeData, options) {
    const section = document.createElement('div');
    section.className = 'char-section';

    const cols = options.colsPerRow || 12;
    const totalStrokes = strokeData ? strokeData.strokeCount : 0;
    const strokes = strokeData ? strokeData.strokes : [];

    // ===== 第一部分：筆順逐步分解 (Progressive Decomposition) =====
    if (options.includeDecomposition) {
      // 如果筆劃大於 (cols - 1)，自動換行容納全部步驟
      const availableColsFirstRow = cols - 1; // 第一格為全字黑體示範，其餘為步驟
      let currentStrokeStep = 1;
      let isFirstRow = true;

      while (currentStrokeStep <= totalStrokes || isFirstRow) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'worksheet-row decomposition-row';

        if (isFirstRow) {
          // 第一列第 1 格：全字標準黑體示範
          const demoCell = document.createElement('div');
          demoCell.className = 'grid-cell demo-cell';
          demoCell.innerHTML = this.createGridSvg({
            strokes,
            drawStrokeCount: totalStrokes,
            fillColor: options.demoCharColor,
            isDemo: true
          }, options);
          rowDiv.appendChild(demoCell);

          // 第一列接續格：第 1 畫、第 1+2 畫...
          for (let c = 1; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell step-cell';

            if (currentStrokeStep <= totalStrokes) {
              // 繪製前 currentStrokeStep 畫
              cell.innerHTML = this.createGridSvg({
                strokes,
                drawStrokeCount: currentStrokeStep,
                fillColor: options.traceColor,
                activeStrokeColor: options.highlightLatestStroke ? options.latestStrokeColor : null
              }, options);
              currentStrokeStep++;
            } else {
              // 步驟已完結，根據設定填入全字描紅或空白
              if (options.emptyBoxFill === 'trace') {
                cell.innerHTML = this.createGridSvg({
                  strokes,
                  drawStrokeCount: totalStrokes,
                  fillColor: options.traceColor
                }, options);
              } else {
                cell.innerHTML = this.createGridSvg({ strokes: [], drawStrokeCount: 0 }, options);
              }
            }
            rowDiv.appendChild(cell);
          }
          isFirstRow = false;
        } else {
          // 溢出筆劃之換行接續
          for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell step-cell';

            if (currentStrokeStep <= totalStrokes) {
              cell.innerHTML = this.createGridSvg({
                strokes,
                drawStrokeCount: currentStrokeStep,
                fillColor: options.traceColor,
                activeStrokeColor: options.highlightLatestStroke ? options.latestStrokeColor : null
              }, options);
              currentStrokeStep++;
            } else {
              if (options.emptyBoxFill === 'trace') {
                cell.innerHTML = this.createGridSvg({
                  strokes,
                  drawStrokeCount: totalStrokes,
                  fillColor: options.traceColor
                }, options);
              } else {
                cell.innerHTML = this.createGridSvg({ strokes: [], drawStrokeCount: 0 }, options);
              }
            }
            rowDiv.appendChild(cell);
          }
        }

        section.appendChild(rowDiv);
      }
    }

    // ===== 第二部分：全字描紅行 (Tracing Row，如同相片第 2 列整排描紅) =====
    if (options.includeTraceRow) {
      const traceRow = document.createElement('div');
      traceRow.className = 'worksheet-row trace-row';
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell trace-cell';
        cell.innerHTML = this.createGridSvg({
          strokes,
          drawStrokeCount: totalStrokes,
          fillColor: options.traceColor
        }, options);
        traceRow.appendChild(cell);
      }
      section.appendChild(traceRow);
    }

    // ===== 第三部分：空白自主習寫行 (Blank Writing Row) =====
    if (options.includeBlankRow) {
      const blankRow = document.createElement('div');
      blankRow.className = 'worksheet-row blank-row';
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell blank-cell';
        // 第一格可選擇是否提供淡描紅提示，其餘為空白
        if (c === 0 && options.includeTraceRow === false) {
          cell.innerHTML = this.createGridSvg({
            strokes,
            drawStrokeCount: totalStrokes,
            fillColor: options.traceColor
          }, options);
        } else {
          cell.innerHTML = this.createGridSvg({ strokes: [], drawStrokeCount: 0 }, options);
        }
        blankRow.appendChild(cell);
      }
      section.appendChild(blankRow);
    }

    return section;
  }

  /**
   * 產生全名連寫練習行 (例如：[許][志][安] [許][志][安]...)
   * @param {Array<Object>} studentCharsData 姓名各字的教育部筆順資料陣列
   * @param {Object} options
   */
  renderContinuousNameRows(studentCharsData, options) {
    const container = document.createElement('div');
    container.className = 'continuous-name-container';
    const cols = options.colsPerRow || 12;
    const nameLen = studentCharsData.length;
    if (nameLen === 0) return container;

    // 產生 3 組姓名練習行：示範+描紅、全描紅、描紅+空白
    const rowTypes = ['demo_and_trace', 'trace_all', 'trace_and_blank'];

    rowTypes.forEach((type, rowIdx) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = `worksheet-row continuous-row row-${type}`;

      let charIndexInName = 0;
      for (let c = 0; c < cols; c++) {
        const charData = studentCharsData[charIndexInName % nameLen];
        const strokes = charData ? charData.strokes : [];
        const isFirstGroup = c < nameLen;

        const cell = document.createElement('div');
        cell.className = 'grid-cell';

        if (type === 'demo_and_trace') {
          if (isFirstGroup) {
            // 第一組姓名為示範黑體
            cell.innerHTML = this.createGridSvg({
              strokes,
              drawStrokeCount: strokes.length,
              fillColor: options.demoCharColor,
              isDemo: true
            }, options);
          } else {
            // 接續為描紅
            cell.innerHTML = this.createGridSvg({
              strokes,
              drawStrokeCount: strokes.length,
              fillColor: options.traceColor
            }, options);
          }
        } else if (type === 'trace_all') {
          cell.innerHTML = this.createGridSvg({
            strokes,
            drawStrokeCount: strokes.length,
            fillColor: options.traceColor
          }, options);
        } else {
          // 半描紅、半空白
          if (c < Math.floor(cols / 2)) {
            cell.innerHTML = this.createGridSvg({
              strokes,
              drawStrokeCount: strokes.length,
              fillColor: options.traceColor
            }, options);
          } else {
            cell.innerHTML = this.createGridSvg({ strokes: [], drawStrokeCount: 0 }, options);
          }
        }

        rowDiv.appendChild(cell);
        charIndexInName++;
      }
      container.appendChild(rowDiv);
    });

    return container;
  }

  /**
   * 建立頁首資訊列 (學校標題、班級、座號、姓名、評分)
   */
  createHeaderElement(student, options) {
    const header = document.createElement('div');
    header.className = 'worksheet-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'header-title';
    titleEl.textContent = options.schoolTitle || '生字練習';
    header.appendChild(titleEl);

    if (options.showStudentHeader) {
      const metaEl = document.createElement('div');
      metaEl.className = 'header-meta';

      const seatText = student.seat ? `座號：<span class="meta-field seat-num">${student.seat}</span>` : '座號：________';
      const nameText = student.name ? `姓名：<span class="meta-field student-name">${student.name}</span>` : '姓名：____________';
      const classText = options.gradeClassText || '____年____班';

      metaEl.innerHTML = `
        <div class="meta-item class-box">${classText}</div>
        <div class="meta-item seat-box">${seatText}</div>
        <div class="meta-item name-box">${nameText}</div>
        ${options.showDate ? '<div class="meta-item date-box">日期：____/____/____</div>' : ''}
        ${options.showScore ? '<div class="meta-item score-box">評分：________</div>' : ''}
      `;
      header.appendChild(metaEl);
    }

    return header;
  }

  /**
   * 產生單一學生的完整 A4 頁面
   * @param {Object} student { name: '許志安', seat: '01' }
   * @param {Object<string, Object>} strokeMap 字元對應之教育部筆順資料
   * @param {Object} options
   * @returns {HTMLElement} .worksheet-page 容器
   */
  generateStudentPage(student, strokeMap, options) {
    // 若為護貝大字白板卡模式，調用專屬白板卡生成器
    if (options.layoutMode === 'whiteboard') {
      return this.renderWhiteboardPage(student, strokeMap, options);
    }

    const page = document.createElement('div');
    page.className = `worksheet-page orientation-${options.paperOrientation}`;

    // 1. 頁首
    const header = this.createHeaderElement(student, options);
    page.appendChild(header);

    // 2. 內容容器
    const content = document.createElement('div');
    content.className = 'worksheet-content';

    const chars = Array.from(student.name || '');
    const studentCharsData = chars.map(c => strokeMap[c]).filter(Boolean);

    if (options.layoutMode === 'decomposition') {
      // 模式 A：逐字分解模式（如使用者相片展示）
      chars.forEach((char) => {
        const charData = strokeMap[char];
        const section = this.renderCharacterSection(charData, options);
        content.appendChild(section);
      });
    } else if (options.layoutMode === 'continuous') {
      // 模式 B：姓名連寫模式
      const continuousSection = this.renderContinuousNameRows(studentCharsData, options);
      content.appendChild(continuousSection);
    } else if (options.layoutMode === 'hybrid') {
      // 模式 C：綜合模式 (上方姓名連寫，下方各字分解)
      const continuousSection = this.renderContinuousNameRows(studentCharsData, { ...options, colsPerRow: options.colsPerRow });
      content.appendChild(continuousSection);

      chars.forEach((char) => {
        const charData = strokeMap[char];
        const section = this.renderCharacterSection(charData, {
          ...options,
          includeBlankRow: false // 節省空間以容納在一頁 A4
        });
        content.appendChild(section);
      });
    }

    page.appendChild(content);

    return page;
  }

  /**
   * 產生專供護貝與白板筆反覆擦寫的「大字姓名白板卡」
   * 只有學生的名字大字，並在旁邊附上筆順順序提示
   */
  renderWhiteboardPage(student, strokeMap, options) {
    const page = document.createElement('div');
    page.className = `worksheet-page whiteboard-page orientation-${options.paperOrientation}`;

    // 1. 簡潔標題列
    const header = document.createElement('div');
    header.className = 'whiteboard-header';
    const seatText = student.seat ? `座號：<span class="meta-field seat-num">${student.seat}</span>` : '';
    const nameText = student.name ? `姓名：<span class="meta-field student-name">${student.name}</span>` : '';
    const classText = options.gradeClassText || '____年____班';

    header.innerHTML = `
      <div class="whiteboard-title-group">
        <h2 class="whiteboard-title">${options.schoolTitle || '生字練習'}</h2>
      </div>
      <div class="whiteboard-student-info">
        <span class="info-item">${classText}</span>
        ${seatText ? `<span class="info-item">${seatText}</span>` : ''}
        ${nameText ? `<span class="info-item">${nameText}</span>` : ''}
      </div>
    `;
    page.appendChild(header);

    // 2. 內容容器
    const content = document.createElement('div');
    content.className = 'whiteboard-content';

    const chars = Array.from(student.name || '');
    const charCount = chars.length;

    // 動態標記字數 class，便於 CSS 自動縮放最佳尺寸
    content.classList.add(`chars-count-${Math.min(Math.max(charCount, 1), 6)}`);
    content.classList.add(`box-mode-${options.whiteboardBoxType}`);

    chars.forEach((char, idx) => {
      const charData = strokeMap[char];
      const strokes = charData ? charData.strokes : [];
      const strokeCount = charData ? charData.strokeCount : 0;

      const card = document.createElement('div');
      card.className = 'whiteboard-char-card';

      // (A) 大字練習區 (左側或主體)
      const boxesGroup = document.createElement('div');
      boxesGroup.className = 'whiteboard-boxes-group';

      // 大字練習格 (預設啟用：空心字 + 筆順虛線 + 方向箭頭 + 起筆數字)
      const traceWrap = document.createElement('div');
      traceWrap.className = 'box-wrapper';
      const isHollowGuide = (options.whiteboardGuideStyle === 'hollow_guide' || !options.whiteboardGuideStyle);
      const boxTagText = isHollowGuide ? `筆順虛線箭頭導引 (${strokeCount}畫)` : `大字描紅 (${strokeCount}畫)`;
      traceWrap.innerHTML = `<span class="box-tag">${boxTagText}</span>`;
      const traceBox = document.createElement('div');
      traceBox.className = 'big-grid-box trace-box';
      traceBox.innerHTML = this.createGridSvg({
        strokes,
        drawStrokeCount: strokeCount,
        fillColor: options.traceColor,
        guideStyle: options.whiteboardGuideStyle || 'hollow_guide',
        trackColor: options.whiteboardTrackColor || '#2563eb',
        numberColor: options.whiteboardNumberColor || '#dc2626',
        showStrokeNumbers: options.showStrokeNumbersOnChar !== false,
        showTrack: options.showTrackWithArrow !== false,
        showArrow: true
      }, options);
      traceWrap.appendChild(traceBox);
      boxesGroup.appendChild(traceWrap);

      // 大空白格 (如果不是純描紅模式)
      if (options.whiteboardBoxType !== 'trace_only') {
        const blankWrap = document.createElement('div');
        blankWrap.className = 'box-wrapper';
        blankWrap.innerHTML = `<span class="box-tag">自主擦寫格</span>`;
        const blankBox = document.createElement('div');
        blankBox.className = 'big-grid-box blank-box';
        blankBox.innerHTML = this.createGridSvg({
          strokes: [],
          drawStrokeCount: 0
        }, options);
        blankWrap.appendChild(blankBox);
        boxesGroup.appendChild(blankWrap);
      }

      card.appendChild(boxesGroup);

      // (B) 旁邊的筆畫順序提示欄
      if (options.showStrokeHintStrip !== false) {
        const hintStrip = document.createElement('div');
        hintStrip.className = 'stroke-hint-strip';

        hintStrip.innerHTML = `
          <div class="hint-strip-header">
            <span class="hint-char-title">【${char}】筆順分解</span>
            <span class="hint-count-badge">共 ${strokeCount} 畫</span>
          </div>
        `;

        const miniGrid = document.createElement('div');
        miniGrid.className = 'hint-mini-grid';

        for (let s = 1; s <= strokeCount; s++) {
          const miniItem = document.createElement('div');
          miniItem.className = 'mini-hint-item';

          const miniBox = document.createElement('div');
          miniBox.className = 'mini-hint-box';
          miniBox.innerHTML = this.createGridSvg({
            strokes,
            drawStrokeCount: s,
            fillColor: options.traceColor,
            activeStrokeColor: '#d63031' // 最新一筆以鮮紅色醒目標示
          }, { ...options, lineDash: 'dotted' });

          miniItem.appendChild(miniBox);
          miniItem.innerHTML += `<span class="mini-hint-num">${s}</span>`;
          miniGrid.appendChild(miniItem);
        }

        hintStrip.appendChild(miniGrid);
        card.appendChild(hintStrip);
      }

      content.appendChild(card);
    });

    page.appendChild(content);

    return page;
  }
}

// 匯出全域實例
window.WorksheetGenerator = new WorksheetGenerator();
