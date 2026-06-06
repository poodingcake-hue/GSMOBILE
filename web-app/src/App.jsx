import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X,
  Grid,
  RefreshCw,
  Plus
} from 'lucide-react';

// CSV Parsing Helper returning row arrays
function parseCSVToRows(text) {
  const lines = text.split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const row = [];
    let insideQuote = false;
    let currentField = '';
    const line = lines[i];
    
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const char = line[charIndex];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField.trim());
    result.push(row.map(val => val.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').trim()));
  }
  return result;
}

// Google Drive URL to direct CDN URL Converter
function getGoogleDriveDirectLink(url) {
  if (!url) return '';
  const reg1 = /id=([a-zA-Z0-9-_]+)/;
  const reg2 = /\/d\/([a-zA-Z0-9-_]+)/;
  const match1 = url.match(reg1);
  const match2 = url.match(reg2);
  const id = match1 ? match1[1] : (match2 ? match2[1] : null);
  if (id) {
    return `https://lh3.googleusercontent.com/d/${id}`;
  }
  return url;
}

// Format date string YYYY-MM-DD H:MM to "D일(요일) HH:MM"
function formatLiveDate(rawDateStr) {
  if (!rawDateStr) return '';
  const parts = rawDateStr.trim().split(' ');
  if (parts.length >= 2) {
    const datePart = parts[0]; // YYYY-MM-DD
    const timePart = parts[1]; // H:MM or HH:MM
    
    // Parse parts manually to avoid Date timezone shifts
    const dateSub = datePart.split('-');
    if (dateSub.length < 3) return rawDateStr;
    const year = parseInt(dateSub[0], 10);
    const month = parseInt(dateSub[1], 10) - 1; // 0-based index
    const day = parseInt(dateSub[2], 10);
    
    const timeSub = timePart.split(':');
    const hour = parseInt(timeSub[0], 10);
    const min = timeSub.length >= 2 ? parseInt(timeSub[1], 10) : 0;
    
    const dateObj = new Date(year, month, day, hour, min);
    if (isNaN(dateObj.getTime())) return rawDateStr;
    
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekdayName = weekdays[dateObj.getDay()];
    
    const formattedHour = String(hour).padStart(2, '0');
    const formattedMin = String(min).padStart(2, '0');
    
    return `${day}일(${weekdayName}) ${formattedHour}:${formattedMin}`;
  }
  return rawDateStr;
}

// Convert time string "HH:MM" or "H:MM" to minutes from midnight for sorting
function timeToMinutes(timeStr) {
  if (!timeStr) return 9999;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 9999;
  const hrs = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  if (isNaN(hrs) || isNaN(mins)) return 9999;
  return hrs * 60 + mins;
}

// Convert "YYYY-MM-DD" to "D일(요일)"
function formatHeaderDate(dateStr) {
  if (!dateStr) return '';
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return dateStr;
  const day = dateObj.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekdayName = weekdays[dateObj.getDay()];
  return `${day}일(${weekdayName})`;
}

const FlowerIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    width="16" 
    height="16" 
    fill="currentColor"
    style={{ 
      display: 'inline-block', 
      verticalAlign: '-2px', 
      margin: '0 0.45rem', 
      color: 'var(--accent-pink)',
      flexShrink: 0
    }}
  >
    <path d="M12 8.5c-.83 0-1.5-.67-1.5-1.5S11.17 4 12 4s1.5 1.77 1.5 3-.67 1.5-1.5 1.5zm3.18 1.82c-.59-.59-.59-1.54 0-2.12s2.05-.34 2.64.25c.59.59.34 2.05-.25 2.64s-1.8-.18-2.39-.77zM12 15.5c.83 0 1.5.67 1.5 1.5s-.67 3-1.5 3-1.5-1.77-1.5-3 .67-1.5 1.5-1.5zm-3.18-5.18c.59.59.59 1.54 0 2.12s-2.05.34-2.64-.25c-.59-.59-.34-2.05.25-2.64s1.8.18 2.39.77zm6.36 3.36c.59.59.34 2.05-.25 2.64s-2.05.34-2.64-.25.18-1.8.77-2.39 1.54-.59 2.12 0zm-9.54-1.18c.59-.59 1.54-.59 2.12 0s.34 2.05-.25 2.64-2.05.34-2.64-.25-.18-1.8.77-2.39zM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
  </svg>
);

// Clean program title based on brand brackets and keyword rules
function cleanProgramTitle(title, mode) {
  if (!title) return '모바일 라이브';
  
  // Apply brackets extraction only to crawled data. Manual (internal) is returned as is.
  if (mode === 'internal') {
    return title;
  }
  
  const bracketRegex = /\[([^\]]+)\]/g;
  const brackets = [];
  let match;
  
  while ((match = bracketRegex.exec(title)) !== null) {
    brackets.push(match[0]);
  }
  
  if (brackets.length === 0) {
    return title;
  }
  
  const remainingText = title.replace(/\[[^\]]+\]/g, ' ');
  
  const keywords = [
    'SJ', '라삐아프', '제이슨우', '아뜰리에', '브리엘', 
    '모르간', '분트로이', '김서룡', '르네크루', '스케쳐스', 
    'FILA', '지프', '스튜디오디페', '쏘내추럴', '코어'
  ];
  
  const foundKeywords = [];
  keywords.forEach(keyword => {
    const regex = new RegExp(keyword, 'i');
    if (regex.test(remainingText)) {
      const badge = keyword; // Excluded keywords are output without brackets.
      
      const isDuplicate = brackets.some(b => b.toLowerCase().includes(badge.toLowerCase())) || 
                          foundKeywords.some(fk => fk.toLowerCase() === badge.toLowerCase());
      if (!isDuplicate) {
        foundKeywords.push(badge);
      }
    }
  });
  
  return [...brackets, ...foundKeywords].join(' ');
}

function App() {

  // Raw parsed datasets
  const [mliveData, setMliveData] = useState([]);
  const [liveData, setLiveData] = useState([]);
  const [imageData, setImageData] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [internalData, setInternalData] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Navigation & filter states
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedPgmId, setSelectedPgmId] = useState('');
  const [allTimes, setAllTimes] = useState(false);
  const [mode, setMode] = useState('crawl'); // 'crawl' (공식 크롤링) or 'internal' (사내 사전 편성)
  const [showAddModal, setShowAddModal] = useState(false);
  

  

  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    textBlock: ''
  });
  const [formStatus, setFormStatus] = useState({
    loading: false,
    success: false,
    message: ''
  });

  // Like state: Set of program keys (date_time_pgmId)
  const [likedPrograms, setLikedPrograms] = useState(() => {
    try {
      const saved = localStorage.getItem('liked_programs');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const getLikeKey = (prog) => `${prog.date}_${prog.broadcast_time}_${prog.pgmId}`;

  const toggleLike = (prog) => {
    const key = getLikeKey(prog);
    setLikedPrograms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem('liked_programs', JSON.stringify([...next]));
      return next;
    });
  };



  const handleSaveInternal = async (e) => {
    e.preventDefault();
    setFormStatus({ loading: true, success: false, message: '' });
    
    try {
      const lines = formData.textBlock.trim().split('\n').map(line => line.trim());
      if (lines.length < 4) {
        throw new Error('사내 데이터 규격이 맞지 않습니다. 최소 4행(방송명, 스튜디오, PD, 호스트) 이상이어야 합니다.');
      }
      
      const pgmTitle = lines[0];
      const location = lines[1];
      const pd = lines[2].replace(/^\[|\]$/g, '');
      const hosts = lines[3].replace(/^\[|\]$/g, '');
      const productIds = lines.slice(4).filter(line => /^\d+$/.test(line));
      
      const date_str = formData.date.replace(/-/g, '');
      const pgmId = `internal_${Date.now()}`;
      
      const newProducts = (productIds.length > 0 ? productIds : ['']).map(prdid => ({
        date: formData.date,
        date_str,
        broadcast_time: formData.time,
        pgmId,
        pgmTitle,
        location,
        pd,
        hosts,
        prdid,
        title: '',
        url: prdid ? `https://m.gsshop.com/prd/prd.gs?prdid=${prdid}` : ''
      }));

      // Netlify 서버리스 함수 호출 (토큰은 서버에서만 관리됨)
      const res = await fetch('/api/save-internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formData.date,
          broadcast_time: formData.time,
          pgmTitle,
          location,
          pd,
          hosts,
          productIds
        })
      });
      
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || '저장에 실패했습니다.');
      }
      
      setFormStatus({
        loading: false,
        success: true,
        message: '저장 완료! 잠시 후 새로고침하면 반영됩니다.'
      });
      
      // Update local state instantly
      setInternalData(prev => [...prev, ...newProducts]);
      
      // Reset textBlock form
      setFormData(prev => ({ ...prev, textBlock: '' }));
      
      // Auto-select the newly added program
      setSelectedDate(formData.date);
      setSelectedPgmId(pgmId);
      
      setTimeout(() => {
        setShowAddModal(false);
        setFormStatus({ loading: false, success: false, message: '' });
      }, 1500);
      
    } catch (err) {
      setFormStatus({
        loading: false,
        success: false,
        message: err.message
      });
    }
  };

  // Modal state
  const [selectedProduct, setSelectedProduct] = useState(null);

  // History API for Back Button integration
  useEffect(() => {
    const handlePopState = (e) => {
      // 1. If stock page is open, close it.
      if (selectedProduct) {
        setSelectedProduct(null);
        return;
      }
      
      // 2. If state contains time, restore time
      if (e.state && e.state.pgmId) {
        setSelectedPgmId(e.state.pgmId);
      } 
      // 3. If state contains date, restore date
      else if (e.state && e.state.date) {
        setSelectedDate(e.state.date);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedProduct]);

  const openStockPage = (product) => {
    if (product.isOurProduct) {
      setSelectedProduct(product);
      window.history.pushState({ stockOpen: true, pgmId: selectedPgmId, date: selectedDate }, '', '#stock');
    }
  };

  const closeStockPage = () => {
    if (window.location.hash === '#stock') {
      window.history.back(); // triggers popstate which sets selectedProduct to null
    } else {
      setSelectedProduct(null);
    }
  };

  const handleDateClick = (date) => {
    if (selectedDate !== date) {
      setSelectedDate(date);
      window.history.pushState({ date }, '', `#date=${date}`);
    }
  };

  const handleTimeClick = (pgmId) => {
    if (selectedPgmId !== pgmId) {
      setSelectedPgmId(pgmId);
      window.history.pushState({ pgmId }, '', `#time=${pgmId}`);
    }
  };

  // Touch Swipe for navigating times
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX;
    touchStartY.current = e.changedTouches[0].screenY;
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const diffX = touchStartX.current - touchEndX;
    const diffY = touchStartY.current - touchEndY;

    // Check if horizontal swipe and more than 50px
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      if (availablePrograms.length === 0) return;
      
      const currentIndex = availablePrograms.findIndex(p => p.pgmId === selectedPgmId);
      if (currentIndex === -1) return;

      if (diffX > 0) {
        // Swiped left -> next time
        if (currentIndex < availablePrograms.length - 1) {
          handleTimeClick(availablePrograms[currentIndex + 1].pgmId);
        }
      } else {
        // Swiped right -> prev time
        if (currentIndex > 0) {
          handleTimeClick(availablePrograms[currentIndex - 1].pgmId);
        }
      }
    }
  };

  // Touch Swipe for Stock Page (Swipe to go back/close)
  const stockTouchStartX = useRef(0);
  const stockTouchStartY = useRef(0);

  const handleStockTouchStart = (e) => {
    stockTouchStartX.current = e.changedTouches[0].screenX;
    stockTouchStartY.current = e.changedTouches[0].screenY;
  };

  const handleStockTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const diffX = stockTouchStartX.current - touchEndX;
    const diffY = stockTouchStartY.current - touchEndY;

    // If swiped horizontally > 50px (e.g. standard left/right swipe)
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      closeStockPage();
    }
  };

  // Load datasets on mount
  useEffect(() => {
    setLoading(true);
    const cacheBuster = Date.now();
    Promise.all([
      fetch(`data/mlive.csv?t=${cacheBuster}`).then(r => {
        if (!r.ok) throw new Error('mlive.csv 파일을 불러올 수 없습니다.');
        return r.text();
      }),
      fetch(`data/live.csv?t=${cacheBuster}`).then(r => {
        if (!r.ok) throw new Error('live.csv 파일을 불러올 수 없습니다.');
        return r.text();
      }),
      fetch(`data/image.csv?t=${cacheBuster}`).then(r => {
        if (!r.ok) throw new Error('image.csv 파일을 불러올 수 없습니다.');
        return r.text();
      }),
      fetch(`data/raw.csv?t=${cacheBuster}`).then(r => {
        if (!r.ok) throw new Error('raw.csv 파일을 불러올 수 없습니다.');
        return r.text();
      }),
      fetch(`data/internal.csv?t=${cacheBuster}`)
        .then(r => r.ok ? r.text() : '')
        .catch(() => '')
    ])
      .then(([mliveText, liveText, imageText, rawText, internalText]) => {
        // 1. Parse MLIVE
        const mliveRows = parseCSVToRows(mliveText);
        const mliveHeaders = mliveRows[0];
        const mliveList = mliveRows.slice(1).map(r => {
          const obj = {};
          mliveHeaders.forEach((h, idx) => {
            obj[h] = r[idx] || '';
          });
          return obj;
        });
        setMliveData(mliveList);

        // 2. Parse LIVE
        const liveRows = parseCSVToRows(liveText);
        setLiveData(liveRows);

        // 3. Parse IMAGE
        const imgRows = parseCSVToRows(imageText);
        setImageData(imgRows);

        // 4. Parse RAW (Inventory)
        const rawRows = parseCSVToRows(rawText);
        setRawData(rawRows);

        // 5. Parse INTERNAL
        let internalList = [];
        if (internalText) {
          const internalRows = parseCSVToRows(internalText);
          if (internalRows.length > 1) {
            const internalHeaders = internalRows[0];
            internalList = internalRows.slice(1).map(r => {
              const obj = {};
              internalHeaders.forEach((h, idx) => {
                obj[h] = r[idx] || '';
              });
              return obj;
            });
          }
        }
        setInternalData(internalList);

        // Auto-select the first date
        if (mliveList.length > 0) {
          const uniqueDates = [...new Set(mliveList.map(item => item.date))].sort();
          if (uniqueDates.length > 0) {
            setSelectedDate(uniqueDates[0]);
            window.history.replaceState({ date: uniqueDates[0] }, '', `#date=${uniqueDates[0]}`);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Auto-select first date from active dataset when mode changes
  useEffect(() => {
    const activeDataset = mode === 'internal' ? internalData : mliveData;
    if (activeDataset.length > 0) {
      const dates = [...new Set(activeDataset.map(item => item.date))].sort();
      if (dates.length > 0 && !dates.includes(selectedDate)) {
        setSelectedDate(dates[0]);
        window.history.replaceState({ date: dates[0] }, '', `#date=${dates[0]}`);
      }
    } else {
      setSelectedDate('');
    }
  }, [mode, mliveData, internalData]);

  // Detect column mapping indices for raw.csv
  const rawColumnIndices = useMemo(() => {
    if (rawData.length === 0) return { prdid: 0, name: 1, color: 3, size: 4, stock: 6, location: 7 };
    const headers = rawData[0].map(h => h.toLowerCase());
    const findIndex = (keywords, def) => {
      const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
      return idx !== -1 ? idx : def;
    };
    return {
      prdid: findIndex(['상품코드', 'prdid', '코드'], 0),
      name: findIndex(['상품명', 'name', '명'], 1),
      color: findIndex(['color', '색상', '색'], 3),
      size: findIndex(['size', '사이즈', '규격'], 4),
      stock: findIndex(['재고', '수량', 'stock', 'qty'], 6),
      location: findIndex(['위치', '로케이션', 'location', 'loc'], 7)
    };
  }, [rawData]);

  // Detect column mapping indices for live.csv
  const liveColumnIndices = useMemo(() => {
    if (liveData.length === 0) return { date: 0, prdid: 2 };
    const headers = liveData[0].map(h => h.toLowerCase());
    
    let dateIdx = headers.findIndex(h => h.includes('날짜') || h.includes('date') || h.includes('일시'));
    let prdIdx = headers.findIndex(h => h.includes('코드') || h.includes('prdid') || h.includes('상품코드'));
    
    if (dateIdx === -1) dateIdx = 0;
    if (prdIdx === -1) {
      if (liveData.length > 1) {
        // scan row 1 for numeric product code format
        const r1 = liveData[1];
        const numIdx = r1.findIndex(v => /^\d{8,12}$/.test(v.replace(/,/g, '').split('.')[0]));
        prdIdx = numIdx !== -1 ? numIdx : 2;
      } else {
        prdIdx = 2;
      }
    }
    return { date: dateIdx, prdid: prdIdx };
  }, [liveData]);

  // Detect column mapping indices for image.csv
  const imageColumnIndices = useMemo(() => {
    if (imageData.length === 0) return { prdid: 0, url: 2, url2: 3 };
    const headers = imageData[0].map(h => h.toLowerCase());
    
    let prdIdx = headers.findIndex(h => h.includes('코드') || h.includes('prdid') || h.includes('상품코드'));
    let urlIdx = headers.findIndex(h => h.includes('이미지') || h.includes('url') || h.includes('주소') || h.includes('image'));
    
    if (prdIdx === -1) prdIdx = 0;
    if (urlIdx === -1) urlIdx = 2;
    
    return { prdid: prdIdx, url: urlIdx, url2: urlIdx + 1 };
  }, [imageData]);

  // Make set of RAW inventory product IDs to identify "our products"
  const ourProductIds = useMemo(() => {
    if (rawData.length <= 1) return new Set();
    const idx = rawColumnIndices.prdid;
    return new Set(rawData.slice(1).map(row => row[idx]).filter(Boolean));
  }, [rawData, rawColumnIndices]);

  // Group MLIVE/INTERNAL entries by broadcast hour for selected date
  const selectedDatePrograms = useMemo(() => {
    if (!selectedDate) return [];
    
    // Get current date (YYYY-MM-DD) and current hour
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const todayDateStr = new Date(now.getTime() - tzOffset).toISOString().split('T')[0];
    const currentHour = now.getHours();

    const progMap = {};
    const activeDataset = mode === 'internal' ? internalData : mliveData;
    activeDataset.forEach(item => {
      if (item.date !== selectedDate) return;
      
      // Filter out past hours if today
      if (selectedDate === todayDateStr) {
        const bHour = parseInt(item.broadcast_time.split(':')[0], 10);
        if (bHour < currentHour - 1) return;
      }

      const key = `${item.broadcast_time}_${item.pgmId}`;
      if (!progMap[key]) {
        progMap[key] = {
          pgmId: item.pgmId,
          pgmTitle: item.pgmTitle,
          broadcast_time: item.broadcast_time,
          date: item.date,
          location: item.location || '',
          pd: item.pd || '',
          hosts: item.hosts || '',
          products: []
        };
      }
      progMap[key].products.push(item);
    });
    
    const list = Object.values(progMap).sort((a, b) => timeToMinutes(a.broadcast_time) - timeToMinutes(b.broadcast_time));
    
    if (allTimes || mode === 'internal') {
      return list;
    } else {
      // Show only times that contain at least one product matching raw.csv
      return list.filter(prog => 
        prog.products.some(p => ourProductIds.has(p.prdid))
      );
    }
  }, [mliveData, internalData, mode, selectedDate, allTimes, ourProductIds]);

  // Extract unique dates for tab rendering
  const uniqueDates = useMemo(() => {
    const activeDataset = mode === 'internal' ? internalData : mliveData;
    return [...new Set(activeDataset.map(p => p.date))].sort();
  }, [mliveData, internalData, mode]);

  // Extract available programs for selected date
  const availablePrograms = useMemo(() => {
    return selectedDatePrograms.map(p => ({
      pgmId: p.pgmId,
      broadcast_time: p.broadcast_time
    }));
  }, [selectedDatePrograms]);

  // Automatically select the first available program when selectedDate or allTimes changes
  const timeScrollRef = useRef(null);

  useEffect(() => {
    if (availablePrograms.length > 0) {
      const hasActivePgm = availablePrograms.some(p => p.pgmId === selectedPgmId);
      if (!hasActivePgm) {
        const newPgmId = availablePrograms[0].pgmId;
        setSelectedPgmId(newPgmId);
        window.history.replaceState({ pgmId: newPgmId }, '', `#time=${newPgmId}`);
      }
    } else {
      setSelectedPgmId('');
    }
  }, [availablePrograms, selectedPgmId]);

  // Auto-scroll active time into center view
  useEffect(() => {
    if (timeScrollRef.current && selectedPgmId) {
      const activeEl = timeScrollRef.current.querySelector('.time-seamless-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedPgmId]);

  // Find the currently selected program block
  const activeProgram = useMemo(() => {
    return selectedDatePrograms.find(p => p.pgmId === selectedPgmId) || null;
  }, [selectedDatePrograms, selectedPgmId]);

  // Map product elements for the active program
  const activeProducts = useMemo(() => {
    if (!activeProgram) return [];
    
    // 기본 사내/공식 상품 정보 매핑 함수
    const mapProductDetails = (p) => {
      const prdid = p.prdid;
      
      // 1. Mapped product name (from raw.csv, fall back to default title)
      let name = p.title || p.pgmTitle || '';
      let location = '';
      if (rawData.length > 1) {
        const foundInv = rawData.slice(1).find(row => row[rawColumnIndices.prdid] === prdid);
        if (foundInv) {
          name = foundInv[rawColumnIndices.name];
          location = foundInv[rawColumnIndices.location];
        }
      }
      
      // 2. Mapped image URL (sheet first, fallback to GS CDN)
      let imageUrl = '';
      let image2Url = '';
      if (imageData.length > 1) {
        const foundImg = imageData.slice(1).find(row => row[imageColumnIndices.prdid] === prdid);
        if (foundImg) {
          if (foundImg[imageColumnIndices.url]) {
            imageUrl = getGoogleDriveDirectLink(foundImg[imageColumnIndices.url]);
          }
          if (foundImg[imageColumnIndices.url2]) {
            image2Url = getGoogleDriveDirectLink(foundImg[imageColumnIndices.url2]);
          }
        }
      }
      // Fallback: GS Shop CDN URL
      if (!imageUrl && prdid) {
        imageUrl = `https://asset.m-gs.kr/prod/${prdid}/1/550`;
      }
      
      // 3. Mapped live dates (format to DD/HH:MM)
      const liveTimes = [];
      if (liveData.length > 1) {
        liveData.slice(1).forEach(row => {
          const rawPrdId = row[liveColumnIndices.prdid];
          if (!rawPrdId) return;
          const cleanPrdId = rawPrdId.replace(/,/g, '').split('.')[0];
          
          if (cleanPrdId === prdid) {
            const rawDate = row[liveColumnIndices.date];
            if (rawDate) {
              liveTimes.push(formatLiveDate(rawDate));
            }
          }
        });
      }
      
      return {
        ...p,
        mappedName: name,
        location,
        imageUrl,
        image2Url,
        liveTimes,
        isOurProduct: ourProductIds.has(prdid),
        comparisonStatus: null
      };
    };

    const mappedManualProducts = activeProgram.products.map(mapProductDetails);

    // 사내 모드일 때 공식 웹 크롤링 데이터와의 비교를 수행합니다.
    if (mode === 'internal') {
      // 동시간대 공식 방송 데이터들 추출
      const candidateOfficialItems = mliveData.filter(item => 
        item.date === selectedDate && item.broadcast_time === activeProgram.broadcast_time
      );

      // pgmId별로 공식 방송 그룹화
      const officialProgramsMap = {};
      candidateOfficialItems.forEach(item => {
        if (!officialProgramsMap[item.pgmId]) {
          officialProgramsMap[item.pgmId] = {
            pgmId: item.pgmId,
            pgmTitle: item.pgmTitle,
            products: []
          };
        }
        officialProgramsMap[item.pgmId].products.push(item);
      });

      const officialPrograms = Object.values(officialProgramsMap);
      const manualPrdids = new Set(activeProgram.products.map(p => p.prdid).filter(Boolean));

      // 최소 1개 이상의 상품 코드가 일치하는 공식 방송 중 최대 일치 방송 매칭
      let pairedOfficialProgram = null;
      let maxOverlapCount = 0;

      officialPrograms.forEach(prog => {
        const progPrdids = prog.products.map(p => p.prdid).filter(Boolean);
        const overlapCount = progPrdids.filter(id => manualPrdids.has(id)).length;
        
        if (overlapCount >= 1 && overlapCount > maxOverlapCount) {
          maxOverlapCount = overlapCount;
          pairedOfficialProgram = prog;
        }
      });

      if (pairedOfficialProgram) {
        const officialPrdids = new Set(pairedOfficialProgram.products.map(p => p.prdid).filter(Boolean));

        // 1) 사내 등록 상품 중 공식 웹에 없는 상품 (편성 제외)
        mappedManualProducts.forEach(prod => {
          if (prod.prdid && !officialPrdids.has(prod.prdid)) {
            prod.comparisonStatus = 'excluded';
          }
        });

        // 2) 공식 웹에 있지만 사내 계획에 없는 상품 (신규 추가)
        const addedOfficialProducts = pairedOfficialProgram.products.filter(item => 
          item.prdid && !manualPrdids.has(item.prdid)
        );

        const mappedAddedProducts = addedOfficialProducts.map(p => {
          const mapped = mapProductDetails(p);
          mapped.comparisonStatus = 'added';
          return mapped;
        });

        return [...mappedManualProducts, ...mappedAddedProducts];
      }
    }

    return mappedManualProducts;
  }, [activeProgram, rawData, imageData, liveData, rawColumnIndices, imageColumnIndices, liveColumnIndices, ourProductIds, mode, mliveData, selectedDate]);

  // Render 2D Inventory Matrix mapping for selectedProduct
  const matrixData = useMemo(() => {
    if (!selectedProduct || rawData.length <= 1) return { sizes: [], colors: [], stockMap: {} };
    
    // Filter rows matching product ID
    const matches = rawData.slice(1).filter(row => row[rawColumnIndices.prdid] === selectedProduct.prdid);
    
    const sizes = [...new Set(matches.map(r => r[rawColumnIndices.size]))].filter(Boolean).sort();
    const colors = [...new Set(matches.map(r => r[rawColumnIndices.color]))].filter(Boolean);
    
    const stockMap = {};
    matches.forEach(r => {
      const key = `${r[rawColumnIndices.color]}_${r[rawColumnIndices.size]}`;
      const qty = parseInt(r[rawColumnIndices.stock], 10);
      stockMap[key] = isNaN(qty) ? 0 : qty;
    });
    
    return { sizes, colors, stockMap };
  }, [selectedProduct, rawData, rawColumnIndices]);

  return (
    <div className="container">
      {/* Sticky Header: Date row + Time seamless scroll */}
      <div className="sticky-header">
        {/* Date row + 모든시간 checkbox or mode toggle control */}
        <div className="date-header-row">
          <div className="date-scroll-wrapper">
            {uniqueDates.map(date => {
              const isActive = selectedDate === date;
              const dateObj = new Date(date);
              const dayNumber = dateObj.getDate();
              const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
              const weekdayName = weekdays[dateObj.getDay()];
              return (
                <button
                  key={date}
                  className={`date-card ${isActive ? 'active' : ''}`}
                  onClick={() => handleDateClick(date)}
                >
                  <span className="date-card-day-name">{weekdayName}</span>
                  <span className="date-card-day-number">{dayNumber}</span>
                </button>
              );
            })}
          </div>
          <div className="date-header-controls">
            <div className="controls-row">
              <button 
                className="mode-toggle-btn" 
                onClick={() => setMode(prev => prev === 'crawl' ? 'internal' : 'crawl')} 
                title={mode === 'crawl' ? '사내 편성표로 전환' : '공식 편성표로 전환'}
              >
                <RefreshCw size={14} className="toggle-icon" />
                <span>{mode === 'crawl' ? '공식' : '사내'}</span>
              </button>
            </div>
            
            {mode === 'crawl' ? (
              <label className="checkbox-label" htmlFor="all-times-checkbox">
                <input
                  type="checkbox"
                  id="all-times-checkbox"
                  className="checkbox-input"
                  checked={allTimes}
                  onChange={(e) => setAllTimes(e.target.checked)}
                />
                모든시간
              </label>
            ) : (
              <div className="internal-actions-row">
                <button className="add-program-btn" onClick={() => setShowAddModal(true)} title="사내 편성 추가">
                  <Plus size={16} />
                  <span>등록</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Seamless Time Scroll */}
        {availablePrograms.length > 0 && (
          <div className="time-seamless-track" ref={timeScrollRef}>
            {availablePrograms.map(p => {
              // Check if this program is liked
              const prog = selectedDatePrograms.find(sp => sp.pgmId === p.pgmId);
              const isLiked = prog ? likedPrograms.has(getLikeKey(prog)) : false;
              const isActive = selectedPgmId === p.pgmId;
              return (
                <button
                  key={p.pgmId}
                  className={`time-seamless-item ${isActive ? 'active' : ''} ${isLiked ? 'liked' : ''}`}
                  onClick={() => handleTimeClick(p.pgmId)}
                >
                  {p.broadcast_time}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Program broadcasting Name */}
      {activeProgram && (
        <h2 className="broadcast-header">
          <span className="broadcast-header-text">
            {formatHeaderDate(activeProgram.date)} {activeProgram.broadcast_time} 방송
            <FlowerIcon />
            {cleanProgramTitle(activeProgram.pgmTitle, mode)}
            {activeProgram.location && ` / 스튜디오: ${activeProgram.location}`}
            {activeProgram.pd && ` / PD: ${activeProgram.pd}`}
            {activeProgram.hosts && ` / 호스트: ${activeProgram.hosts}`}
          </span>
          <button
            className={`heart-btn ${likedPrograms.has(getLikeKey(activeProgram)) ? 'liked' : ''}`}
            onClick={() => toggleLike(activeProgram)}
            aria-label="좋아요"
          >
            {likedPrograms.has(getLikeKey(activeProgram)) ? '♥️' : '♡'}
          </button>
        </h2>
      )}

      {/* States handler */}
      {loading ? (
        <div className="empty-state">
          <RefreshCw className="empty-state-icon animate-spin" />
          <h3 className="empty-state-title">데이터 불러오는 중</h3>
          <p className="empty-state-desc">구글 시트 연동 파일들을 로딩하는 중입니다.</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <X className="empty-state-icon" style={{ color: 'var(--accent-red)' }} />
          <h3 className="empty-state-title">연동에 실패하였습니다</h3>
          <p className="empty-state-desc" style={{ color: 'var(--accent-red)' }}>{error}</p>
        </div>
      ) : activeProducts.length === 0 ? (
        <div className="empty-state">
          <Grid className="empty-state-icon" />
          <h3 className="empty-state-title">편성 내역이 없습니다</h3>
          <p className="empty-state-desc">선택된 시간대에 등록된 상품이 없거나 필터 조건이 맞지 않습니다.</p>
        </div>
      ) : (
        /* 4. Products Grid */
        <main 
          className="product-grid"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activeProducts.map(product => {
            const isExcluded = product.status === '편성제외';
            const showCard = mode === 'internal' || product.isOurProduct || allTimes;
            
            if (!showCard) return null;

            let cardClasses = `product-card ${isExcluded ? 'excluded-state' : ''}`;
            if (product.comparisonStatus === 'excluded') {
              cardClasses += ' comparison-excluded';
            } else if (product.comparisonStatus === 'added') {
              cardClasses += ' comparison-added';
            }

            return (
              <div 
                key={product.prdid} 
                className={cardClasses}
                onClick={() => openStockPage(product)}
                style={{ cursor: product.isOurProduct ? 'pointer' : 'default' }}
              >
                {/* Image Container (Full bleed) */}
                <div className="product-img-container">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      className="product-img" 
                      alt={product.mappedName}
                      loading="lazy"
                    />
                  ) : (
                    <div className="no-image-placeholder">이미지 준비중</div>
                  )}

                  {/* Overlays on Image - Live Times only */}
                  {product.liveTimes.length > 0 && (
                    <div className="overlays-container">
                      {product.liveTimes.map((lt, idx) => {
                        let badgeColorClass = 'badge-pink';
                        if (idx === 1) badgeColorClass = 'badge-blue';
                        else if (idx >= 2) badgeColorClass = 'badge-green';
                        
                        return (
                          <span key={idx} className={`overlay-date-badge ${badgeColorClass}`}>
                            {lt}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Info body (Product Name & Status below image container) */}
                <div className="product-info-body">
                  {/* Location / Brand */}
                  <div className="product-loc-brand">
                    {product.location || '-'}
                  </div>

                  <h3 className="product-title" title={product.mappedName}>
                    {product.mappedName}
                  </h3>
                  
                  {product.comparisonStatus && (
                    <div className="product-status-row">
                      {product.comparisonStatus === 'excluded' ? (
                        <span className="status-badge comparison-excluded">공식 웹 제외</span>
                      ) : (
                        <span className="status-badge comparison-added">공식 웹 추가</span>
                      )}
                    </div>
                  )}
                  {product.status === '편성제외' && (
                    <div className="product-status-row">
                      <span className="status-badge excluded">제외</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </main>
      )}

      {/* 5. Inventory Full Page View */}
      {selectedProduct && (
        <div 
          className="stock-page-container"
          onTouchStart={handleStockTouchStart}
          onTouchEnd={handleStockTouchEnd}
        >
          <div className="stock-page-header">
            <h3 className="stock-page-title">재고 수량 확인</h3>
            <button className="stock-page-close-btn" onClick={closeStockPage}>
              <X size={24} />
            </button>
          </div>
          
          <div className="stock-page-body">
            {/* Product Images (Continuous Scroll) */}
            <div className="stock-page-images">
              {selectedProduct.imageUrl ? (
                <img 
                  src={selectedProduct.imageUrl} 
                  className="stock-page-img" 
                  alt={selectedProduct.mappedName} 
                />
              ) : null}
              {selectedProduct.image2Url ? (
                <img 
                  src={selectedProduct.image2Url} 
                  className="stock-page-img" 
                  alt={`${selectedProduct.mappedName} 추가사진`} 
                />
              ) : null}
              {(!selectedProduct.imageUrl && !selectedProduct.image2Url) && (
                <div className="stock-page-noimg">이미지 없음</div>
              )}
            </div>

            <div className="stock-page-details">
              <h4 className="stock-page-product-title">{selectedProduct.mappedName}</h4>
              <div className="stock-page-meta">
                <span className="stock-page-code">{selectedProduct.prdid}</span>
                {selectedProduct.location && (
                  <span className="stock-page-location">
                    {selectedProduct.location}
                  </span>
                )}
              </div>
            </div>

            {/* 2D Stock Matrix table */}
            {matrixData.colors.length > 0 ? (
              <div className={`matrix-table-container ${matrixData.sizes.length >= 6 ? 'scrollable' : 'fit-screen'}`}>
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="color-col-header"></th>
                      {matrixData.sizes.map(size => (
                        <th key={size}>{size}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.colors.map(color => (
                      <tr key={color}>
                        <td className="row-header">{color}</td>
                        {matrixData.sizes.map(size => {
                          const key = `${color}_${size}`;
                          const stock = matrixData.stockMap[key];
                          const hasStock = stock !== undefined && stock > 0;
                          return (
                            <td 
                              key={size} 
                              className={`stock-cell ${hasStock ? '' : 'empty'}`}
                            >
                              {hasStock ? stock : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  등록된 재고 상세 옵션 정보가 없습니다.
                </div>
              )}
            </div>
          </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">사내 편성 정보 등록</h3>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveInternal}>
              <div className="form-group">
                <label className="form-label">방송일 선택</label>
                <input 
                  type="date" 
                  className="form-input"
                  required 
                  value={formData.date} 
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">방송시간 선택</label>
                <input 
                  type="time" 
                  className="form-input"
                  required 
                  value={formData.time} 
                  onChange={e => setFormData(prev => ({ ...prev, time: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">사내 데이터 입력란 (엑셀 셀 붙여넣기)</label>
                <textarea 
                  className="form-textarea"
                  required 
                  placeholder="예시:&#10;[멀티A]코어&#10;M3&#10;[김경언]&#10;[임민수,최세인]&#10;1103683581&#10;1103681696"
                  value={formData.textBlock}
                  onChange={e => setFormData(prev => ({ ...prev, textBlock: e.target.value }))}
                  rows={8}
                />
              </div>
              
              {formStatus.message && (
                <div className={`form-status-msg ${formStatus.success ? 'success' : 'error'}`}>
                  {formStatus.message}
                </div>
              )}
              
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>
                  취소
                </button>
                <button type="submit" className="btn-submit" disabled={formStatus.loading}>
                  {formStatus.loading ? '저장 및 전송 중...' : '저장 및 깃허브 전송'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
}

export default App;
