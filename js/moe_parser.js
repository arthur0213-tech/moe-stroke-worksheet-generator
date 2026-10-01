/**
 * 臺灣教育部國字標準字體筆順資料解析與快取模組
 * 資料來源優先順序：
 * 1. 臺灣教育部《常用國字標準字體筆順學習網》向量外框及筆順軌跡 (首選)
 * 2. 筆順字典 (https://www.twpen.com/) 罕見字與異體字筆順分解與導引圖資 (如「喆」、「伃」、「碁」、「堃」等教育部未收錄字)
 * 3. HanziWriter 開源漢字筆順向量庫 (終極備援)
 */

class MoeStrokeParser {
  constructor() {
    this.memoryCache = new Map();
    this.storagePrefix = 'moe_stroke_v3_';
  }

  /**
   * 取得單一國字的筆順向量資料
   * @param {string} char 欲查詢之單一國字
   * @returns {Promise<Object>} 包含 strokeCount、strokes[]、source 等資訊
   */
  async getStrokeData(char) {
    if (!char || typeof char !== 'string') {
      throw new Error('請提供正確的國字');
    }
    const singleChar = Array.from(char)[0];
    const codePoint = singleChar.codePointAt(0);
    const hex = codePoint.toString(16).toLowerCase();

    // 1. 檢查記憶體快取
    if (this.memoryCache.has(singleChar)) {
      return this.memoryCache.get(singleChar);
    }

    // 2. 檢查 LocalStorage 快取
    try {
      const cached = localStorage.getItem(this.storagePrefix + hex);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.strokeCount > 0) {
          this.memoryCache.set(singleChar, parsed);
          return parsed;
        }
      }
    } catch (e) {
      console.warn('讀取 LocalStorage 快取失敗:', e);
    }

    let strokeData = null;

    // 3. 第一優先：嘗試從臺灣教育部筆順資料庫取得 XML
    try {
      const xmlText = await this.fetchXml(singleChar, hex);
      strokeData = this.parseXml(singleChar, hex, xmlText);
      strokeData.source = 'moe';
    } catch (moeErr) {
      console.info(`教育部筆順庫未收錄「${singleChar}」(${hex})，改從筆順字典 (twpen.com) 查詢...`);
    }

    // 4. 第二優先：若教育部找不到（如「喆」、「伃」等），從 https://www.twpen.com/ 取得並解析向量與軌跡
    if (!strokeData) {
      try {
        strokeData = await this.fetchFromTwPen(singleChar, hex);
      } catch (twpenErr) {
        console.warn(`筆順字典 (twpen.com) 查詢「${singleChar}」失敗，嘗試開源備援庫:`, twpenErr);
      }
    }

    // 5. 第三優先：終極備援 HanziWriter 筆順向量庫
    if (!strokeData) {
      try {
        strokeData = await this.fetchFromHanziWriter(singleChar, hex);
      } catch (hwErr) {
        throw new Error(`無法載入國字「${singleChar}」的筆順資料（教育部與 twpen.com 皆無此字）。`);
      }
    }

    // 6. 存入快取
    this.memoryCache.set(singleChar, strokeData);
    try {
      localStorage.setItem(this.storagePrefix + hex, JSON.stringify(strokeData));
    } catch (e) {
      console.warn('寫入 LocalStorage 快取警告:', e);
    }

    return strokeData;
  }

  /**
   * 第一優先：嘗試從 CDN 或代理端點獲取臺灣教育部 XML 筆畫資料
   */
  async fetchXml(char, hex) {
    const urls = [
      // 主要高速 CDN (jsdelivr c9s/zh-stroke-data, 完整台灣教育部標準字體資料庫)
      `https://cdn.jsdelivr.net/gh/c9s/zh-stroke-data@master/utf8/${hex}.xml`,
      // 備份 GitHub raw
      `https://raw.githubusercontent.com/c9s/zh-stroke-data/master/utf8/${hex}.xml`,
      // 備份代理 MOE 官網查詢
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://stroke-order.learningweb.moe.edu.tw/searchW.jsp?WORD=${encodeURIComponent(char)}`)}`
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const text = await res.text();

        // 若是來自 MOE 官方網頁的 HTML，解析其中的 xml[...] 字串
        if (text.includes('<html') || text.includes('dictView')) {
          const match = text.match(/xml\[\d+\]\s*=\s*"(<\?xml.+?)"\s*;/s);
          if (match && match[1]) {
            const cleanXml = match[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            return cleanXml;
          }
        } else if (text.includes('<Word') || text.includes('<?xml')) {
          return text;
        }
      } catch (err) {
        // 繼續嘗試下一個來源
      }
    }

    throw new Error(`教育部資料庫無「${char}」`);
  }

  /**
   * 第二優先：從 https://www.twpen.com/ (筆順字典) 載入筆順分解圖與筆順導引圖，
   * 自動透過次像素邊緣追蹤 (Interpolated Marching Squares) 與中軸骨架演算法 (Zhang-Suen Skeleton)
   * 轉換為與教育部格式 100% 相容的 2048x2048 SVG 向量外框 (outline) 與中心軌跡 (track)。
   */
  async fetchFromTwPen(char, hex) {
    const strokeImgUrls = [
      `https://wsrv.nl/?url=${encodeURIComponent(`https://www.twpen.com/bishun-stroke/${hex}.png`)}`,
      `https://images.weserv.nl/?url=${encodeURIComponent(`https://www.twpen.com/bishun-stroke/${hex}.png`)}`
    ];
    const numberImgUrls = [
      `https://wsrv.nl/?url=${encodeURIComponent(`https://www.twpen.com/bishun-number/${hex}-number.png`)}`,
      `https://images.weserv.nl/?url=${encodeURIComponent(`https://www.twpen.com/bishun-number/${hex}-number.png`)}`
    ];

    const strokeImg = await this.loadImageWithFallback(strokeImgUrls);
    let numberImg = null;
    try {
      numberImg = await this.loadImageWithFallback(numberImgUrls);
    } catch (e) {
      // 若無 number 圖仍可由骨架推導方向
    }

    // 解析 twpen.com 筆畫分解圖 (每列最多 4 格，每格 200x200，間距 X: 5 + col*210, Y: 10 + row*259)
    const canvas = document.createElement('canvas');
    canvas.width = strokeImg.width;
    canvas.height = strokeImg.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(strokeImg, 0, 0);

    let numImgData = null;
    if (numberImg) {
      const nCanvas = document.createElement('canvas');
      nCanvas.width = numberImg.width;
      nCanvas.height = numberImg.height;
      const nCtx = nCanvas.getContext('2d', { willReadFrequently: true });
      nCtx.drawImage(numberImg, 0, 0);
      numImgData = nCtx.getImageData(0, 0, numberImg.width, numberImg.height);
    }

    const totalRows = Math.floor((strokeImg.height + 20) / 259);
    const cellW = 200;
    const cellH = 200;
    const scale = 2048 / cellW; // 10.24
    const strokes = [];

    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < 4; c++) {
        const x0 = 5 + c * 210;
        const y0 = 10 + r * 259;
        if (x0 + cellW > strokeImg.width || y0 + cellH > strokeImg.height) continue;

        const cellData = ctx.getImageData(x0, y0, cellW, cellH).data;
        // 建立當前紅筆畫的連續紅度場 (Redness field: R - max(G, B))
        const field = new Float32Array(cellW * cellH);
        const binary = new Uint8Array(cellW * cellH);
        let redPixelCount = 0;
        const threshold = 75;

        for (let y = 2; y < cellH - 2; y++) {
          for (let x = 2; x < cellW - 2; x++) {
            const idx = (y * cellW + x) * 4;
            const redVal = cellData[idx] - Math.max(cellData[idx + 1], cellData[idx + 2]);
            field[y * cellW + x] = redVal;
            if (redVal >= threshold) {
              binary[y * cellW + x] = 1;
              redPixelCount++;
            }
          }
        }

        // 若此格無紅色筆畫像素（代表已進入尾端空白或 twpen Logo 格），則結束讀取
        if (redPixelCount < 22) {
          break;
        }

        // 1. 次像素邊緣追蹤產生平滑 SVG 外框路徑 (Outline)
        const outlinePath = this.traceFieldToSvgPath(field, cellW, cellH, threshold, scale);

        // 2. 中軸骨架化產生筆順中心虛線與方向軌跡 (Track)
        const trackPoints = this.extractCenterlineTrack(binary, cellW, cellH, scale, numImgData);

        strokes.push({
          order: strokes.length + 1,
          outline: outlinePath,
          track: trackPoints
        });
      }
    }

    if (strokes.length === 0) {
      throw new Error(`無法從 twpen.com 解析「${char}」的筆畫影像`);
    }

    return {
      char,
      hex,
      unicode: hex.toUpperCase(),
      strokeCount: strokes.length,
      viewBox: '0 0 2048 2048',
      source: 'twpen',
      sourceUrl: `https://www.twpen.com/${encodeURIComponent(char)}.html`,
      strokes
    };
  }

  /**
   * 載入跨網域圖片 (支援多組備援 URL)
   */
  loadImageWithFallback(urls) {
    return new Promise((resolve, reject) => {
      let idx = 0;
      const tryNext = () => {
        if (idx >= urls.length) {
          reject(new Error('圖片載入失敗'));
          return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          idx++;
          tryNext();
        };
        img.src = urls[idx];
      };
      tryNext();
    });
  }

  /**
   * 使用線性插值 Marching Squares 將 200x200 紅度場轉為平滑 2048x2048 SVG Path
   */
  traceFieldToSvgPath(field, w, h, threshold, scale) {
    // 為每個格線邊建立唯一鍵值以串接封閉多邊形
    // 水平邊 (x, y) -> (x+1, y): id = y * w + x
    // 垂直邊 (x, y) -> (x, y+1): id = 100000 + y * w + x
    const hEdgeId = (x, y) => y * w + x;
    const vEdgeId = (x, y) => 100000 + y * w + x;

    const pointMap = new Map();
    const nextMap = new Map(); // edgeId -> Array of target edgeIds

    const interp = (v1, v2) => {
      const dv = v2 - v1;
      if (Math.abs(dv) < 1e-5) return 0.5;
      return Math.max(0.0, Math.min(1.0, (threshold - v1) / dv));
    };

    const addSegment = (inId, inPt, outId, outPt) => {
      pointMap.set(inId, inPt);
      pointMap.set(outId, outPt);
      if (!nextMap.has(inId)) {
        nextMap.set(inId, [outId]);
      } else {
        nextMap.get(inId).push(outId);
      }
    };

    for (let y = 1; y < h - 2; y++) {
      for (let x = 1; x < w - 2; x++) {
        const vTL = field[y * w + x];
        const vTR = field[y * w + (x + 1)];
        const vBR = field[(y + 1) * w + (x + 1)];
        const vBL = field[(y + 1) * w + x];

        const bTL = vTL >= threshold ? 8 : 0;
        const bTR = vTR >= threshold ? 4 : 0;
        const bBR = vBR >= threshold ? 2 : 0;
        const bBL = vBL >= threshold ? 1 : 0;
        const code = bTL | bTR | bBR | bBL;
        if (code === 0 || code === 15) continue;

        const idTop = hEdgeId(x, y);
        const idBottom = hEdgeId(x, y + 1);
        const idLeft = vEdgeId(x, y);
        const idRight = vEdgeId(x + 1, y);

        const ptTop = () => ({ x: x + interp(vTL, vTR), y });
        const ptBottom = () => ({ x: x + interp(vBL, vBR), y: y + 1 });
        const ptLeft = () => ({ x, y: y + interp(vTL, vBL) });
        const ptRight = () => ({ x: x + 1, y: y + interp(vTR, vBR) });

        // 順時針繞行內部區域 (保持內部在右側)
        switch (code) {
          case 1: addSegment(idBottom, ptBottom(), idLeft, ptLeft()); break;
          case 2: addSegment(idRight, ptRight(), idBottom, ptBottom()); break;
          case 3: addSegment(idRight, ptRight(), idLeft, ptLeft()); break;
          case 4: addSegment(idTop, ptTop(), idRight, ptRight()); break;
          case 5:
            addSegment(idTop, ptTop(), idLeft, ptLeft());
            addSegment(idBottom, ptBottom(), idRight, ptRight());
            break;
          case 6: addSegment(idTop, ptTop(), idBottom, ptBottom()); break;
          case 7: addSegment(idTop, ptTop(), idLeft, ptLeft()); break;
          case 8: addSegment(idLeft, ptLeft(), idTop, ptTop()); break;
          case 9: addSegment(idBottom, ptBottom(), idTop, ptTop()); break;
          case 10:
            addSegment(idLeft, ptLeft(), idBottom, ptBottom());
            addSegment(idRight, ptRight(), idTop, ptTop());
            break;
          case 11: addSegment(idRight, ptRight(), idTop, ptTop()); break;
          case 12: addSegment(idLeft, ptLeft(), idRight, ptRight()); break;
          case 13: addSegment(idBottom, ptBottom(), idRight, ptRight()); break;
          case 14: addSegment(idLeft, ptLeft(), idBottom, ptBottom()); break;
        }
      }
    }

    const visited = new Set();
    let svgPath = '';

    for (const [startId, targets] of nextMap.entries()) {
      if (visited.has(startId) || !targets || targets.length === 0) continue;

      const loop = [];
      let curr = startId;
      while (curr !== undefined && !visited.has(curr)) {
        visited.add(curr);
        const pt = pointMap.get(curr);
        if (pt) loop.push(pt);
        const nextList = nextMap.get(curr);
        if (!nextList || nextList.length === 0) break;
        curr = nextList.find(id => !visited.has(id));
      }

      if (loop.length < 6) continue;

      // 進行 2 次拉普拉斯平滑以消除像素階梯感
      let pts = loop;
      for (let pass = 0; pass < 2; pass++) {
        const n = pts.length;
        const smoothed = new Array(n);
        for (let i = 0; i < n; i++) {
          const pPrev = pts[(i - 1 + n) % n];
          const pCurr = pts[i];
          const pNext = pts[(i + 1) % n];
          smoothed[i] = {
            x: 0.25 * pPrev.x + 0.5 * pCurr.x + 0.25 * pNext.x,
            y: 0.25 * pPrev.y + 0.5 * pCurr.y + 0.25 * pNext.y
          };
        }
        pts = smoothed;
      }

      // 每隔 2 點取樣並以二次貝茲中點樣條 (Quadratic Midpoint Spline) 輸出平滑曲線
      const sampled = [];
      const step = pts.length > 24 ? 2 : 1;
      for (let i = 0; i < pts.length; i += step) {
        sampled.push({
          x: pts[i].x * scale,
          y: pts[i].y * scale
        });
      }

      const m = sampled.length;
      if (m < 3) continue;
      const mid0X = ((sampled[m - 1].x + sampled[0].x) / 2).toFixed(1);
      const mid0Y = ((sampled[m - 1].y + sampled[0].y) / 2).toFixed(1);
      svgPath += `M ${mid0X} ${mid0Y} `;

      for (let i = 0; i < m; i++) {
        const pCurr = sampled[i];
        const pNext = sampled[(i + 1) % m];
        const midX = ((pCurr.x + pNext.x) / 2).toFixed(1);
        const midY = ((pCurr.y + pNext.y) / 2).toFixed(1);
        svgPath += `Q ${pCurr.x.toFixed(1)} ${pCurr.y.toFixed(1)} ${midX} ${midY} `;
      }
      svgPath += 'Z ';
    }

    return svgPath.trim();
  }

  /**
   * 從二值化筆畫遮罩萃取中軸骨架 (Zhang-Suen Thinning + 樹徑最短路徑搜尋)，
   * 並定位起筆與收筆方向以供虛線與箭頭導引使用。
   */
  extractCenterlineTrack(binary, w, h, scale, numImgData, refTrackPoints) {
    const skel = new Uint8Array(binary);
    const toClear = [];

    // Zhang-Suen Thinning 骨架細化
    let changed = true;
    let iter = 0;
    while (changed && iter < 25) {
      changed = false;
      iter++;

      for (let step = 0; step < 2; step++) {
        toClear.length = 0;
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            if (skel[idx] === 0) continue;

            const p2 = skel[(y - 1) * w + x];
            const p3 = skel[(y - 1) * w + (x + 1)];
            const p4 = skel[y * w + (x + 1)];
            const p5 = skel[(y + 1) * w + (x + 1)];
            const p6 = skel[(y + 1) * w + x];
            const p7 = skel[(y + 1) * w + (x - 1)];
            const p8 = skel[y * w + (x - 1)];
            const p9 = skel[(y - 1) * w + (x - 1)];

            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;

            const A =
              (p2 === 0 && p3 === 1 ? 1 : 0) +
              (p3 === 0 && p4 === 1 ? 1 : 0) +
              (p4 === 0 && p5 === 1 ? 1 : 0) +
              (p5 === 0 && p6 === 1 ? 1 : 0) +
              (p6 === 0 && p7 === 1 ? 1 : 0) +
              (p7 === 0 && p8 === 1 ? 1 : 0) +
              (p8 === 0 && p9 === 1 ? 1 : 0) +
              (p9 === 0 && p2 === 1 ? 1 : 0);

            if (A !== 1) continue;

            if (step === 0) {
              if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) {
                toClear.push(idx);
              }
            } else {
              if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) {
                toClear.push(idx);
              }
            }
          }
        }
        if (toClear.length > 0) {
          changed = true;
          for (let i = 0; i < toClear.length; i++) {
            skel[toClear[i]] = 0;
          }
        }
      }
    }

    // 收集骨架點
    let firstNode = -1;
    for (let i = 0; i < skel.length; i++) {
      if (skel[i] === 1) {
        firstNode = i;
        break;
      }
    }
    if (firstNode === -1) return [];

    // 兩次 BFS 尋找骨架圖的最長主幹路徑 (Tree Diameter Spine)
    const bfsFarthest = (startIdx) => {
      const parent = new Int32Array(w * h).fill(-1);
      const visited = new Uint8Array(w * h);
      const queue = [startIdx];
      visited[startIdx] = 1;
      let head = 0;
      let last = startIdx;

      const dirs = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, -1], [-1, 1], [1, 1]
      ];

      while (head < queue.length) {
        const curr = queue[head++];
        last = curr;
        const cx = curr % w;
        const cy = (curr - cx) / w;

        for (let d = 0; d < 8; d++) {
          const nx = cx + dirs[d][0];
          const ny = cy + dirs[d][1];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (skel[nIdx] === 1 && !visited[nIdx]) {
            visited[nIdx] = 1;
            parent[nIdx] = curr;
            queue.push(nIdx);
          }
        }
      }
      return { farthest: last, parent };
    };

    const pass1 = bfsFarthest(firstNode);
    const pass2 = bfsFarthest(pass1.farthest);

    // 回溯主幹路徑
    const rawPath = [];
    let curr = pass2.farthest;
    while (curr !== -1) {
      const x = curr % w;
      const y = (curr - x) / w;
      rawPath.push({ x, y });
      curr = pass2.parent[curr];
    }

    if (rawPath.length < 2) {
      const p = rawPath[0];
      return [{ x: p.x * scale, y: p.y * scale, size: 120 }];
    }

    // 判斷起筆端點 (rawPath[0] vs rawPath[last])
    const pA = rawPath[0];
    const pB = rawPath[rawPath.length - 1];
    let shouldReverse = false;

    if (refTrackPoints && refTrackPoints.length > 0) {
      const m0 = refTrackPoints[0];
      const dA = Math.hypot(pA.x * scale - m0.x, pA.y * scale - m0.y);
      const dB = Math.hypot(pB.x * scale - m0.x, pB.y * scale - m0.y);
      shouldReverse = dB < dA;
    } else {
      shouldReverse = this.shouldReverseTrack(pA, pB, w, h, numImgData);
    }

    if (shouldReverse) {
      rawPath.reverse();
    }

    // 對骨架路徑進行輕量平滑（保留轉折角並維持在筆畫正中央）
    const smoothed = rawPath.map((pt, idx) => {
      if (idx === 0 || idx === rawPath.length - 1) return pt;
      const win = 2;
      let sx = 0, sy = 0, cnt = 0;
      for (let k = Math.max(0, idx - win); k <= Math.min(rawPath.length - 1, idx + win); k++) {
        sx += rawPath[k].x;
        sy += rawPath[k].y;
        cnt++;
      }
      return { x: sx / cnt, y: sy / cnt };
    });

    // 以高密度取樣（最多約 24 點），確保轉折與彎鉤平滑貼合筆畫中心，絕不超出筆畫外框
    const sampled = [];
    const step = Math.max(1, Math.floor(smoothed.length / 24));
    sampled.push({ x: Math.round(smoothed[0].x * scale), y: Math.round(smoothed[0].y * scale), size: 120 });
    for (let i = step; i < smoothed.length - Math.max(1, Math.floor(step / 2)); i += step) {
      sampled.push({ x: Math.round(smoothed[i].x * scale), y: Math.round(smoothed[i].y * scale), size: 120 });
    }
    const lastPt = smoothed[smoothed.length - 1];
    sampled.push({ x: Math.round(lastPt.x * scale), y: Math.round(lastPt.y * scale), size: 120 });

    return sampled;
  }

  /**
   * 將 SVG Outline 路徑光柵化至 200x200 畫布並萃取真實幾何中軸線 (Medial Axis)，
   * 解決教育部原始 XML <Track> 在轉折處（如「楊」、「允」）超出字體外框的問題。
   */
  computeMedialTrackFromOutline(outlinePath, refTrackPoints) {
    if (!outlinePath || typeof Path2D === 'undefined') {
      return refTrackPoints;
    }
    try {
      const w = 200;
      const h = 200;
      const scale = 2048 / w;
      if (!this._medialCanvas) {
        this._medialCanvas = document.createElement('canvas');
        this._medialCanvas.width = w;
        this._medialCanvas.height = h;
        this._medialCtx = this._medialCanvas.getContext('2d', { willReadFrequently: true });
      }
      const ctx = this._medialCtx;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.scale(w / 2048, h / 2048);
      ctx.fillStyle = '#000000';
      const path2d = new Path2D(outlinePath);
      ctx.fill(path2d);
      ctx.restore();

      const imgData = ctx.getImageData(0, 0, w, h).data;
      const binary = new Uint8Array(w * h);
      let count = 0;
      for (let i = 0; i < w * h; i++) {
        if (imgData[i * 4 + 3] >= 110) {
          binary[i] = 1;
          count++;
        }
      }
      if (count < 10) return refTrackPoints;

      const medialTrack = this.extractCenterlineTrack(binary, w, h, scale, null, refTrackPoints);
      return (medialTrack && medialTrack.length >= 2) ? medialTrack : refTrackPoints;
    } catch (e) {
      return refTrackPoints;
    }
  }

  /**
   * 判斷兩端點 pA 與 pB 孰為起筆：
   * 優先比對 twpen.com 筆順圖上的紅字起筆號碼與藍箭頭收筆像素，並結合楷書筆順通則（由上而下、由左而右）
   */
  shouldReverseTrack(pA, pB, w, h, numImgData) {
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;

    // 若對角線為「左下 <-> 右上」（可能為「撇」右上至左下，或「提」左下至右上），且有 number 圖資可比對
    if (numImgData && dx * dy < 0 && Math.abs(dx) > 6 && Math.abs(dy) > 6) {
      const nw = numImgData.width;
      const nh = numImgData.height;
      const data = numImgData.data;

      const scoreEndpoint = (pt) => {
        const cx = Math.round((pt.x / w) * nw);
        const cy = Math.round((pt.y / h) * nh);
        let redScore = 0;
        let blueScore = 0;
        const r = 16;
        for (let y = Math.max(0, cy - r); y <= Math.min(nh - 1, cy + r); y++) {
          for (let x = Math.max(0, cx - r); x <= Math.min(nw - 1, cx + r); x++) {
            const idx = (y * nw + x) * 4;
            const R = data[idx], G = data[idx + 1], B = data[idx + 2];
            if (R - Math.max(G, B) > 55) redScore++;
            if (B - Math.max(R, G) > 45) blueScore++;
          }
        }
        // 起筆處有紅色號碼且較少實心藍色箭頭
        return redScore * 2 - blueScore;
      };

      const scoreA = scoreEndpoint(pA);
      const scoreB = scoreEndpoint(pB);
      if (Math.abs(scoreA - scoreB) > 10) {
        return scoreB > scoreA;
      }
    }

    // 楷書標準筆順通則：
    // 1. 若接近水平筆畫 (|dx| > |dy| * 1.35)，一律由左往右 (起筆 x 較小)
    if (Math.abs(dx) > Math.abs(dy) * 1.35) {
      return pA.x > pB.x;
    }
    // 2. 其餘垂直、撇、捺、點、折筆畫，一律由上往下 (起筆 y 較小)
    return pA.y > pB.y;
  }

  /**
   * 第三優先：從開源 HanziWriter 筆順資料庫取得向量與中心軌跡 (1024 座標系轉 2048 座標系)
   */
  async fetchFromHanziWriter(char, hex) {
    const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${encodeURIComponent(char)}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HanziWriter 無「${char}」`);
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.strokes)) {
      throw new Error(`HanziWriter 資料格式異常`);
    }

    const strokes = data.strokes.map((pathStr, idx) => {
      // 將 1024x1024 (y 軸反轉於 900) 轉換至 2048x2048
      const tokens = pathStr.trim().split(/\s+/);
      let out = '';
      let i = 0;
      while (i < tokens.length) {
        const t = tokens[i];
        if (/^[MLQCZ]$/i.test(t)) {
          out += t + ' ';
          i++;
        } else {
          const x = parseFloat(tokens[i]);
          const y = parseFloat(tokens[i + 1]);
          if (!isNaN(x) && !isNaN(y)) {
            const tx = (x * 2).toFixed(1);
            const ty = ((900 - y) * 2).toFixed(1);
            out += `${tx} ${ty} `;
          }
          i += 2;
        }
      }

      const medians = (data.medians && data.medians[idx]) ? data.medians[idx] : [];
      const rawTrack = medians.map(pt => ({
        x: Math.round(pt[0] * 2),
        y: Math.round((900 - pt[1]) * 2),
        size: 120
      }));
      const cleanOutline = out.trim();
      const track = this.computeMedialTrackFromOutline(cleanOutline, rawTrack);

      return {
        order: idx + 1,
        outline: cleanOutline,
        track
      };
    });

    return {
      char,
      hex,
      unicode: hex.toUpperCase(),
      strokeCount: strokes.length,
      viewBox: '0 0 2048 2048',
      source: 'hanziwriter',
      strokes
    };
  }

  /**
   * 解析教育部 XML，轉換為 SVG Outline 路徑與幾何中軸 Track 軌跡
   */
  parseXml(char, hex, xmlText) {
    const domParser = new DOMParser();
    const xmlDoc = domParser.parseFromString(xmlText, 'text/xml');
    const wordNode = xmlDoc.querySelector('Word');
    if (!wordNode) {
      throw new Error(`國字「${char}」的筆順資料格式不正確`);
    }

    const strokeNodes = xmlDoc.querySelectorAll('Word > Stroke');
    const strokes = [];

    strokeNodes.forEach((sNode, index) => {
      // 1. 解析外框輪廓 (Outline)
      const outlineNode = sNode.querySelector('Outline');
      let pathData = '';
      if (outlineNode) {
        for (const cmd of outlineNode.children) {
          const tag = cmd.tagName;
          if (tag === 'MoveTo') {
            const x = cmd.getAttribute('x');
            const y = cmd.getAttribute('y');
            pathData += `M ${x} ${y} `;
          } else if (tag === 'LineTo') {
            const x = cmd.getAttribute('x');
            const y = cmd.getAttribute('y');
            pathData += `L ${x} ${y} `;
          } else if (tag === 'QuadTo' || tag === 'QuadBezierTo') {
            const x1 = cmd.getAttribute('x1');
            const y1 = cmd.getAttribute('y1');
            const x2 = cmd.getAttribute('x2');
            const y2 = cmd.getAttribute('y2');
            pathData += `Q ${x1} ${y1} ${x2} ${y2} `;
          } else if (tag === 'CubicTo' || tag === 'CubicBezierTo') {
            const x1 = cmd.getAttribute('x1');
            const y1 = cmd.getAttribute('y1');
            const x2 = cmd.getAttribute('x2');
            const y2 = cmd.getAttribute('y2');
            const x3 = cmd.getAttribute('x3');
            const y3 = cmd.getAttribute('y3');
            pathData += `C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3} `;
          }
        }
        if (pathData) {
          pathData += 'Z ';
        }
      }

      // 2. 解析教育部原始筆順導引軌跡 (Track)
      const rawTrackPoints = [];
      const trackNode = sNode.querySelector('Track');
      if (trackNode) {
        for (const pt of trackNode.children) {
          if (pt.tagName === 'MoveTo') {
            rawTrackPoints.push({
              x: parseFloat(pt.getAttribute('x') || 0),
              y: parseFloat(pt.getAttribute('y') || 0),
              size: parseFloat(pt.getAttribute('size') || 120)
            });
          }
        }
      }

      const cleanOutline = pathData.trim();
      // 由筆畫實際外框計算幾何中軸線，確保虛線與箭頭 100% 居中於筆畫內部且不變形
      const trackPoints = this.computeMedialTrackFromOutline(cleanOutline, rawTrackPoints);

      strokes.push({
        order: index + 1,
        outline: cleanOutline,
        track: trackPoints
      });
    });

    return {
      char,
      hex,
      unicode: hex.toUpperCase(),
      strokeCount: strokes.length,
      viewBox: '0 0 2048 2048',
      source: 'moe',
      strokes
    };
  }

  /**
   * 批次預載入多個字的筆劃資料
   * @param {string[]} chars 國字陣列
   * @param {Function} onProgress 進度回呼函數 (completed, total)
   */
  async preloadChars(chars, onProgress) {
    const uniqueChars = Array.from(new Set(chars.filter(c => c && c.trim())));
    let done = 0;
    const results = {};

    for (const char of uniqueChars) {
      try {
        const data = await this.getStrokeData(char);
        results[char] = data;
      } catch (e) {
        console.error(`預載「${char}」失敗:`, e);
        results[char] = null;
      }
      done++;
      if (onProgress) onProgress(done, uniqueChars.length, char);
    }
    return results;
  }
}

// 匯出全域單例
window.MoeParser = new MoeStrokeParser();
