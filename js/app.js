/**
 * 主應用程式邏輯 (Application Controller)
 * 負責事件綁定、即時資料獲取、預覽渲染、列印與筆順播放互動
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM 元素引用
  const studentNameInput = document.getElementById('studentName');
  const studentSeatInput = document.getElementById('studentSeat');
  const batchRosterInput = document.getElementById('batchRoster');
  const customWordsInput = document.getElementById('customWords');
  
  const layoutModeSelect = document.getElementById('layoutMode');
  const colsPerRowSelect = document.getElementById('colsPerRow');
  const colsPerRowGroup = document.getElementById('colsPerRowGroup');
  const paperOrientationSelect = document.getElementById('paperOrientation');
  const gridTypeSelect = document.getElementById('gridType');
  const gridColorSelect = document.getElementById('gridColor');
  const traceColorSelect = document.getElementById('traceColor');
  const emptyBoxFillSelect = document.getElementById('emptyBoxFill');
  
  const checkDecomposition = document.getElementById('checkDecomposition');
  const checkTraceRow = document.getElementById('checkTraceRow');
  const checkBlankRow = document.getElementById('checkBlankRow');
  const checkHighlightLatest = document.getElementById('checkHighlightLatest');

  // 白板卡專用元件
  const whiteboardOptionsGroup = document.getElementById('whiteboardOptionsGroup');
  const normalLayoutControls = document.getElementById('normalLayoutControls');
  const whiteboardBoxTypeSelect = document.getElementById('whiteboardBoxType');
  const whiteboardGuideStyleSelect = document.getElementById('whiteboardGuideStyle');
  const whiteboardTrackColorSelect = document.getElementById('whiteboardTrackColor');
  const checkShowTrackWithArrow = document.getElementById('checkShowTrackWithArrow');
  const checkShowStrokeNumbers = document.getElementById('checkShowStrokeNumbers');
  const checkShowStrokeHintStrip = document.getElementById('checkShowStrokeHintStrip');
  
  const schoolTitleInput = document.getElementById('schoolTitle');
  const gradeClassTextInput = document.getElementById('gradeClassText');
  const checkShowStudentHeader = document.getElementById('checkShowStudentHeader');
  
  const previewArea = document.getElementById('previewArea');
  const previewInfo = document.getElementById('previewInfo');
  const btnPrint = document.getElementById('btnPrint');
  
  // 縮放按鈕
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');
  const zoomLabel = document.getElementById('zoomLabel');

  // 動畫播放器
  const btnPlayDemo = document.getElementById('btnPlayDemo');
  const playerModal = document.getElementById('playerModal');
  const btnPlayerClose = document.getElementById('btnPlayerClose');
  const playerCharTitle = document.getElementById('playerCharTitle');
  const playerCompletedStrokes = document.getElementById('playerCompletedStrokes');
  const playerCurrentStroke = document.getElementById('playerCurrentStroke');
  const strokeStepText = document.getElementById('strokeStepText');
  const btnPlayerPlay = document.getElementById('btnPlayerPlay');
  const btnPlayerPrev = document.getElementById('btnPlayerPrev');
  const btnPlayerNext = document.getElementById('btnPlayerNext');
  const btnPlayerReset = document.getElementById('btnPlayerReset');

  // 狀態變數
  let currentTab = 'single'; // 'single', 'batch', 'custom'
  let currentZoom = 0.85;
  let renderDebounceTimer = null;
  let activeStrokeData = null; // 當前播放動畫的國字筆畫資料
  let animationTimer = null;
  // 支援 URL 參數 (例如 ?mode=whiteboard&name=王品喆)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('mode') && layoutModeSelect) {
    layoutModeSelect.value = urlParams.get('mode');
  }
  if (urlParams.has('name') && studentNameInput) {
    studentNameInput.value = urlParams.get('name');
  }

  // 1. 標籤頁切換
  const tabButtons = document.querySelectorAll('#inputTabs .tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;

      document.getElementById('tabSingle').style.display = currentTab === 'single' ? 'block' : 'none';
      document.getElementById('tabBatch').style.display = currentTab === 'batch' ? 'block' : 'none';
      document.getElementById('tabCustom').style.display = currentTab === 'custom' ? 'block' : 'none';

      triggerRender();
    });
  });

  // 2. 蒐集當前所有設定參數
  function getOptions() {
    return {
      paperOrientation: paperOrientationSelect.value,
      colsPerRow: parseInt(colsPerRowSelect.value, 10),
      gridType: gridTypeSelect.value,
      gridColor: gridColorSelect.value,
      traceColor: traceColorSelect.value,
      emptyBoxFill: emptyBoxFillSelect.value,
      
      layoutMode: layoutModeSelect.value,
      includeDecomposition: checkDecomposition.checked,
      includeTraceRow: checkTraceRow.checked,
      includeBlankRow: checkBlankRow.checked,
      highlightLatestStroke: checkHighlightLatest.checked,
      latestStrokeColor: '#d63031',
      
      // 白板卡專屬選項
      whiteboardBoxType: whiteboardBoxTypeSelect ? whiteboardBoxTypeSelect.value : 'trace_and_blank',
      whiteboardGuideStyle: whiteboardGuideStyleSelect ? whiteboardGuideStyleSelect.value : 'hollow_guide',
      whiteboardTrackColor: whiteboardTrackColorSelect ? whiteboardTrackColorSelect.value : '#2563eb',
      whiteboardNumberColor: '#dc2626',
      showTrackWithArrow: checkShowTrackWithArrow ? checkShowTrackWithArrow.checked : true,
      showStrokeNumbersOnChar: checkShowStrokeNumbers ? checkShowStrokeNumbers.checked : true,
      showStrokeHintStrip: checkShowStrokeHintStrip ? checkShowStrokeHintStrip.checked : true,

      schoolTitle: schoolTitleInput.value.trim(),
      gradeClassText: gradeClassTextInput.value.trim(),
      showStudentHeader: checkShowStudentHeader.checked,
      demoCharColor: '#111111'
    };
  }

  // 3. 解析待產生的學生名單
  function getStudentsList() {
    if (currentTab === 'single') {
      const name = studentNameInput.value.trim() || '許志安';
      const seat = studentSeatInput.value.trim();
      return [{ name, seat }];
    } else if (currentTab === 'batch') {
      const lines = batchRosterInput.value.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return [{ name: '許志安', seat: '01' }];

      return lines.map(line => {
        // 嘗試匹配 "01 陳大明" 或 "1. 陳大明" 或純 "陳大明"
        const match = line.match(/^(\d+)[.\s、\t]+(.+)$/);
        if (match) {
          return { seat: match[1], name: match[2].trim() };
        }
        return { seat: '', name: line };
      });
    } else {
      // custom
      const words = customWordsInput.value.trim() || '中正國小';
      return [{ name: words, seat: '' }];
    }
  }

  // 4. 觸發重新渲染 (防抖處理)
  function triggerRender() {
    clearTimeout(renderDebounceTimer);
    renderDebounceTimer = setTimeout(renderWorksheet, 250);
  }

  // 5. 核心渲染流程
  async function renderWorksheet() {
    const students = getStudentsList();
    const options = getOptions();

    // 更新列印頁面直橫向設定
    if (options.paperOrientation === 'landscape') {
      document.body.classList.add('print-landscape');
    } else {
      document.body.classList.remove('print-landscape');
    }

    // 取得所有學生姓名中使用到的不重複國字
    const allChars = [];
    students.forEach(s => {
      Array.from(s.name).forEach(c => {
        if (c.trim()) allChars.push(c);
      });
    });
    const uniqueChars = Array.from(new Set(allChars));

    previewInfo.innerHTML = `<span class="spinner"></span> 正在載入教育部標準筆畫資料 (${uniqueChars.length} 字)...`;

    try {
      // 批次載入教育部筆劃資料
      const strokeMap = await window.MoeParser.preloadChars(uniqueChars, (done, total, char) => {
        previewInfo.innerHTML = `<span class="spinner"></span> 正在解析國字筆畫 [${char}] (${done}/${total})...`;
      });

      // 清空預覽區
      previewArea.innerHTML = '';

      // 為每位學生產生專屬 A4 頁面
      students.forEach(student => {
        const pageEl = window.WorksheetGenerator.generateStudentPage(student, strokeMap, options);
        previewArea.appendChild(pageEl);
      });

      // 套用當前縮放等級
      applyZoom();

      // 更新首個字至動畫播放器備用
      if (uniqueChars.length > 0 && strokeMap[uniqueChars[0]]) {
        activeStrokeData = strokeMap[uniqueChars[0]];
      }

      const twpenChars = uniqueChars.filter(c => strokeMap[c] && strokeMap[c].source === 'twpen');
      const sourceNote = twpenChars.length > 0
        ? ` <span style="background:rgba(59,130,246,0.25);color:#93c5fd;padding:2px 8px;border-radius:99px;font-size:12px;margin-left:6px;">📚 筆順字典(twpen.com)補充：${twpenChars.join('、')}</span>`
        : '';

      previewInfo.innerHTML = `已生成 <strong>${students.length}</strong> 位學生練習單 (${options.paperOrientation === 'portrait' ? 'A4直向' : 'A4橫向'})${sourceNote}`;
    } catch (err) {
      console.error('渲染失敗:', err);
      previewInfo.innerHTML = `<span style="color:#ef4444;">⚠️ 產生失敗: ${err.message}</span>`;
    }
  }

  // 6. 縮放控制
  function applyZoom() {
    const pages = document.querySelectorAll('.worksheet-page');
    pages.forEach(p => {
      p.style.transform = `scale(${currentZoom})`;
      p.style.marginBottom = `${(currentZoom - 1) * 300}px`; // 補償縮放後的間距
    });
    zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.4) {
      currentZoom += 0.1;
      applyZoom();
    }
  });

  btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.4) {
      currentZoom -= 0.1;
      applyZoom();
    }
  });

  btnZoomReset.addEventListener('click', () => {
    currentZoom = 0.85;
    applyZoom();
  });

  // 7. 列印按鈕事件
  btnPrint.addEventListener('click', () => {
    window.print();
  });

  // 8. 監聽所有表單變更
  const inputElements = [
    studentNameInput, studentSeatInput, batchRosterInput, customWordsInput,
    layoutModeSelect, colsPerRowSelect, paperOrientationSelect, gridTypeSelect,
    gridColorSelect, traceColorSelect, emptyBoxFillSelect,
    checkDecomposition, checkTraceRow, checkBlankRow, checkHighlightLatest,
    schoolTitleInput, gradeClassTextInput, checkShowStudentHeader,
    whiteboardBoxTypeSelect, whiteboardGuideStyleSelect, whiteboardTrackColorSelect,
    checkShowTrackWithArrow, checkShowStrokeNumbers, checkShowStrokeHintStrip
  ];

  // 監聽版面範本切換，動態顯示/隱藏白板卡專用設定
  function updateLayoutModeUI() {
    const isWhiteboard = layoutModeSelect.value === 'whiteboard';
    if (whiteboardOptionsGroup) {
      whiteboardOptionsGroup.style.display = isWhiteboard ? 'block' : 'none';
    }
    if (normalLayoutControls) {
      normalLayoutControls.style.display = isWhiteboard ? 'none' : 'block';
    }
    if (colsPerRowGroup) {
      colsPerRowGroup.style.display = isWhiteboard ? 'none' : 'block';
    }
  }

  layoutModeSelect.addEventListener('change', () => {
    updateLayoutModeUI();
  });
  updateLayoutModeUI();

  inputElements.forEach(el => {
    if (el) {
      el.addEventListener('input', triggerRender);
      el.addEventListener('change', triggerRender);
    }
  });

  // 9. 教育部筆順動畫教學 Modal 邏輯
  btnPlayDemo.addEventListener('click', () => {
    if (!activeStrokeData) {
      const students = getStudentsList();
      const firstChar = Array.from(students[0].name)[0];
      window.MoeParser.getStrokeData(firstChar).then(data => {
        activeStrokeData = data;
        openPlayerModal();
      }).catch(e => {
        alert('請先在左側輸入國字');
      });
    } else {
      openPlayerModal();
    }
  });

  btnPlayerClose.addEventListener('click', () => {
    closePlayerModal();
  });

  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayerModal();
  });

  function openPlayerModal() {
    if (!activeStrokeData) return;
    playerCharTitle.textContent = `教育部標準筆順：【${activeStrokeData.char}】 (共 ${activeStrokeData.strokeCount} 畫)`;
    playerModal.classList.add('active');
    resetPlayer();
    startAnimation();
  }

  function closePlayerModal() {
    playerModal.classList.remove('active');
    stopAnimation();
  }

  function resetPlayer() {
    stopAnimation();
    currentStepIndex = 0;
    playerCompletedStrokes.innerHTML = '';
    playerCurrentStroke.setAttribute('d', '');
    updateStepText();
  }

  function updateStepText() {
    if (!activeStrokeData) return;
    strokeStepText.textContent = `筆順：第 ${currentStepIndex} / ${activeStrokeData.strokeCount} 畫`;
  }

  function drawStep(step) {
    if (!activeStrokeData || step < 0 || step > activeStrokeData.strokeCount) return;
    currentStepIndex = step;
    updateStepText();

    playerCompletedStrokes.innerHTML = '';
    // 繪製前 step - 1 畫為黑色
    for (let i = 0; i < step - 1; i++) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', activeStrokeData.strokes[i].outline);
      p.setAttribute('fill', '#111111');
      playerCompletedStrokes.appendChild(p);
    }

    // 當前最新一筆繪製為亮藍色/紅色
    if (step > 0 && step <= activeStrokeData.strokeCount) {
      playerCurrentStroke.setAttribute('d', activeStrokeData.strokes[step - 1].outline);
      playerCurrentStroke.setAttribute('fill', '#2563eb');
    } else {
      playerCurrentStroke.setAttribute('d', '');
    }
  }

  function startAnimation() {
    stopAnimation();
    btnPlayerPlay.textContent = '暫停播放';
    animationTimer = setInterval(() => {
      if (currentStepIndex < activeStrokeData.strokeCount) {
        drawStep(currentStepIndex + 1);
      } else {
        // 播完後停頓一下重新開始
        clearInterval(animationTimer);
        setTimeout(() => {
          if (playerModal.classList.contains('active')) {
            resetPlayer();
            startAnimation();
          }
        }, 1200);
      }
    }, 700);
  }

  function stopAnimation() {
    clearInterval(animationTimer);
    animationTimer = null;
    btnPlayerPlay.textContent = '播放動畫';
  }

  btnPlayerPlay.addEventListener('click', () => {
    if (animationTimer) {
      stopAnimation();
    } else {
      if (currentStepIndex >= activeStrokeData.strokeCount) {
        resetPlayer();
      }
      startAnimation();
    }
  });

  btnPlayerNext.addEventListener('click', () => {
    stopAnimation();
    if (currentStepIndex < activeStrokeData.strokeCount) {
      drawStep(currentStepIndex + 1);
    }
  });

  btnPlayerPrev.addEventListener('click', () => {
    stopAnimation();
    if (currentStepIndex > 1) {
      drawStep(currentStepIndex - 1);
    } else {
      resetPlayer();
    }
  });

  btnPlayerReset.addEventListener('click', () => {
    resetPlayer();
  });

  // 初始觸發第一次渲染
  triggerRender();
});
