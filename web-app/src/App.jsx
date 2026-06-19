import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X,
  Grid,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Video,
  Headphones,
  Mic,
  Printer
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

const PROGRAM_EMOJIS = ['🌟', '✨', '🔥', '🎉', '💎', '🛍️', '🎁', '📺', '🚀', '💡'];

const FlowerIcon = ({ seed }) => {
  let hash = 0;
  if (seed) {
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
  }
  const index = Math.abs(hash) % PROGRAM_EMOJIS.length;

  return (
    <span style={{ 
      margin: '0 0.45rem 0 0', 
      fontSize: '0.8em', 
      verticalAlign: 'middle',
      lineHeight: 1
    }}>{PROGRAM_EMOJIS[index]}</span>
  );
};

// Clean program title based on brand brackets and keyword rules
function cleanProgramTitle(title, mode, isDesktop = true) {
  if (!title) return '모바일 라이브';
  
  let resultStr = title;
  
  // Apply brackets extraction only to crawled data.
  // For internal (세일즈온), completely remove brackets and their content.
  if (mode === 'internal') {
    resultStr = title.replace(/\[[^\]]+\]/g, '').trim();
  } else {
    const bracketRegex = /\[([^\]]+)\]/g;
    const brackets = [];
    let match;
    
    while ((match = bracketRegex.exec(title)) !== null) {
      brackets.push(match[0]);
    }
    
    if (brackets.length > 0) {
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
      
      // Strip surrounding square brackets from bracket tokens before display
      const cleanBrackets = brackets.map(b => b.replace(/^\[|\]$/g, ''));
      resultStr = [...cleanBrackets, ...foundKeywords].join(' ');
    }
  }

  // Apply truncation limit based on device
  const maxLength = isDesktop ? 16 : 14;
  if (resultStr.length > maxLength) {
    return resultStr.substring(0, maxLength) + '...';
  }
  
  return resultStr;
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
  const [fetchedNames, setFetchedNames] = useState({});
  const [allTimes, setAllTimes] = useState(false);
  const [mode, setMode] = useState('crawl'); // 'crawl' (공식 크롤링) or 'internal' (사내 사전 편성)
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHourPicker, setShowHourPicker] = useState(false);
  
  const dateScrollRef = useRef(null);
  const timeScrollRef = useRef(null);
  
  const scrollContainer = (ref, offset) => {
    if (ref.current) {
      ref.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };
  const [formData, setFormData] = useState({
    date: '',
    hour: '',
    minute: '00',
    textBlock: ''
  });
  const [formStatus, setFormStatus] = useState({
    loading: false,
    success: false,
    message: ''
  });

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 900);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      if (!formData.date || !formData.hour || !formData.textBlock) {
        throw new Error('필수 항목(방송일, 방송시간, 데이터 입력란)을 입력해주세요.');
      }
      
      const broadcast_time = `${formData.hour.padStart(2, '0')}:${formData.minute.padStart(2, '0')}`;
      
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
        broadcast_time,
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
          broadcast_time,
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
      
      // Reset form
      setFormData({
        date: '',
        hour: '',
        minute: '00',
        textBlock: ''
      });
      
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
      if (window.location.hash !== '#stock') {
        window.history.pushState({ stockOpen: true, pgmId: selectedPgmId, date: selectedDate }, '', '#stock');
      }
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
        .catch(() => ''),
      fetch(`data/vod.csv?t=${cacheBuster}`)
        .then(r => r.ok ? r.text() : '')
        .catch(() => '')
    ])
      .then(([mliveText, liveText, imageText, rawText, internalText, vodText]) => {
        // 0. Parse VOD exclusions
        const vodSet = new Set();
        if (vodText) {
          const vodRows = parseCSVToRows(vodText);
          vodRows.forEach(row => {
            if (row.length > 0 && row[0]) {
              vodSet.add(row[0].trim());
            }
          });
        }

        // 1. Parse MLIVE
        const mliveRows = parseCSVToRows(mliveText);
        const mliveHeaders = mliveRows[0];
        const mliveList = mliveRows.slice(1).map(r => {
          const obj = {};
          mliveHeaders.forEach((h, idx) => {
            obj[h] = r[idx] || '';
          });
          return obj;
        }).filter(item => !vodSet.has(item.pgmId));
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

        // Auto-select the first valid future date
        if (mliveList.length > 0) {
          const now = new Date();
          const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const todayDateStr = kstNow.toISOString().split('T')[0];
          const dates = [...new Set(mliveList.map(item => item.date))]
            .filter(d => d >= todayDateStr)
            .sort();
          if (dates.length > 0) {
            setSelectedDate(dates[0]);
            window.history.replaceState({ date: dates[0] }, '', `#date=${dates[0]}`);
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

  // Auto-select first valid date from active dataset when mode changes
  useEffect(() => {
    const activeDataset = mode === 'internal' ? internalData : mliveData;
    if (activeDataset.length > 0) {
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayDateStr = kstNow.toISOString().split('T')[0];
      const dates = [...new Set(activeDataset.map(item => item.date))]
        .filter(d => d >= todayDateStr)
        .sort();
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
    
    // KST-aware current datetime
    const now = new Date();
    // Get KST date string: Korea is UTC+9
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayDateStr = kstNow.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const kstHour = kstNow.getUTCHours();
    const kstMin = kstNow.getUTCMinutes();
    const nowMinutes = kstHour * 60 + kstMin; // minutes from midnight KST

    const progMap = {};
    const activeDataset = mode === 'internal' ? internalData : mliveData;
    activeDataset.forEach(item => {
      if (item.date !== selectedDate) return;
      
      // Strictly filter out past programs on today
      if (selectedDate === todayDateStr) {
        const [bH, bM] = item.broadcast_time.split(':').map(Number);
        const broadcastMinutes = bH * 60 + (bM || 0);
        if (broadcastMinutes < nowMinutes) return;
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

  // Extract unique dates for tab rendering — only today and future
  const uniqueDates = useMemo(() => {
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayDateStr = kstNow.toISOString().split('T')[0];
    const activeDataset = mode === 'internal' ? internalData : mliveData;
    return [...new Set(activeDataset.map(p => p.date))]
      .filter(d => d >= todayDateStr)
      .sort();
  }, [mliveData, internalData, mode]);

  // Extract available programs for selected date
  const availablePrograms = useMemo(() => {
    return selectedDatePrograms.map(p => ({
      pgmId: p.pgmId,
      broadcast_time: p.broadcast_time
    }));
  }, [selectedDatePrograms]);

  // Automatically select the first available program when selectedDate or allTimes changes
  // removed duplicate timeScrollRef

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
      let isFallbackName = (!p.title || p.title === '-' || p.title === p.pgmTitle);
      let location = '';
      if (rawData.length > 1) {
        const foundInv = rawData.slice(1).find(row => row[rawColumnIndices.prdid] === prdid);
        if (foundInv && foundInv[rawColumnIndices.name] && foundInv[rawColumnIndices.name] !== '-') {
          name = foundInv[rawColumnIndices.name];
          location = foundInv[rawColumnIndices.location];
          isFallbackName = false;
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
      
      // 3. Mapped live dates (format to DD/HH:MM) — only future broadcasts (KST-aware)
      // rawDate is in KST ("YYYY-MM-DD HH:MM"), convert to UTC ms for comparison
      const nowUtcMs = Date.now();
      const liveTimes = [];
      if (liveData.length > 1) {
        liveData.slice(1).forEach(row => {
          const rawPrdId = row[liveColumnIndices.prdid];
          if (!rawPrdId) return;
          const cleanPrdId = rawPrdId.replace(/,/g, '').split('.')[0];
          
          if (cleanPrdId === prdid) {
            const rawDate = row[liveColumnIndices.date]; // "YYYY-MM-DD HH:MM" in KST
            if (rawDate) {
              const parts = rawDate.trim().split(' ');
              if (parts.length >= 2) {
                const [y, mo, d] = parts[0].split('-').map(Number);
                const [h, m] = parts[1].split(':').map(Number);
                // Convert KST to UTC: subtract 9 hours
                const broadcastUtcMs = Date.UTC(y, mo - 1, d, h - 9, m);
                if (broadcastUtcMs >= nowUtcMs) {
                  liveTimes.push(formatLiveDate(rawDate));
                }
              }
            }
          }
        });
      }

      
      return {
        ...p,
        mappedName: fetchedNames[prdid] && fetchedNames[prdid] !== 'fetching...' ? fetchedNames[prdid] : name,
        needsNameFetch: isFallbackName && !fetchedNames[prdid],
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
  }, [activeProgram, rawData, imageData, liveData, rawColumnIndices, imageColumnIndices, liveColumnIndices, ourProductIds, mode, mliveData, selectedDate, fetchedNames]);

  // Fetch missing product names dynamically via Google Apps Script API
  // (Removed because GS Shop SPA blocks external fetch and returns '안내' or '{{ hlTitle }}')

  const excludedItems = useMemo(() => activeProducts.filter(p => p.comparisonStatus === 'excluded'), [activeProducts]);
  const addedItems = useMemo(() => activeProducts.filter(p => p.comparisonStatus === 'added'), [activeProducts]);

  const handleDateArrow = (direction) => {
    const currentIndex = uniqueDates.indexOf(selectedDate);
    if (currentIndex === -1) return;
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < uniqueDates.length) {
      handleDateClick(uniqueDates[newIndex]);
    }
  };

  const handleTimeArrow = (direction) => {
    const currentIndex = availablePrograms.findIndex(p => p.pgmId === selectedPgmId);
    if (currentIndex === -1) return;
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < availablePrograms.length) {
      handleTimeClick(availablePrograms[newIndex].pgmId);
    }
  };

  // Global keyboard shortcut: Tab = next time, Shift+Tab = prev time
  // When at boundary of time list, Tab/Shift+Tab wraps to next/prev date
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only activate on desktop and when no input/textarea/select is focused
      if (!isDesktop) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Ignore if a modal is open
      if (showAddModal) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        const currentTimeIndex = availablePrograms.findIndex(p => p.pgmId === selectedPgmId);
        const nextTimeIndex = currentTimeIndex + direction;

        if (nextTimeIndex >= 0 && nextTimeIndex < availablePrograms.length) {
          // Move to next/prev time within same day
          handleTimeClick(availablePrograms[nextTimeIndex].pgmId);
        } else {
          // At the boundary → move to next/prev date
          const currentDateIndex = uniqueDates.indexOf(selectedDate);
          const nextDateIndex = currentDateIndex + direction;
          if (nextDateIndex >= 0 && nextDateIndex < uniqueDates.length) {
            handleDateClick(uniqueDates[nextDateIndex]);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, showAddModal, availablePrograms, selectedPgmId, uniqueDates, selectedDate]);

  // Render 2D Inventory Matrix mapping for selectedProduct
  const matrixData = useMemo(() => {
    if (!selectedProduct || !selectedProduct.prdid || rawData.length <= 1) return { sizes: [], colors: [], stockMap: {} };
    
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
      {/* Sticky Header: Right Control Panel on Desktop */}
      <div className="sticky-header">
        {isDesktop ? (
          <>
            {/* 1. Mode Toggle (Full Width) */}
            <div className="controls-row-top" style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="mode-toggle-btn full-width-btn" 
                onClick={() => setMode(prev => prev === 'crawl' ? 'internal' : 'crawl')} 
                title={mode === 'crawl' ? '세일즈온 등록정보로 전환' : 'GS SHOP 보기로 전환'}
                style={{ flex: 1 }}
              >
                <span>{mode === 'crawl' ? 'GS SHOP' : '세일즈온 등록정보'}</span>
              </button>
              <button 
                className="print-btn" 
                onClick={() => window.print()}
                title="화면 인쇄"
                style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              >
                <Printer size={18} color="#475569" />
              </button>
            </div>

            <div className="panel-section time-date-section">
              {/* 2. Date row with arrows */}
              <div className="scroll-row-with-arrows">
                <button className="scroll-arrow-btn" onClick={() => handleDateArrow(-1)}>
                  <ChevronLeft />
                </button>
                <div className="date-scroll-wrapper" ref={dateScrollRef}>
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
                <button className="scroll-arrow-btn" onClick={() => handleDateArrow(1)}>
                  <ChevronRight />
                </button>
              </div>
            {availablePrograms.length > 0 && (
              <div className="scroll-row-with-arrows time-scroll-section">
                <button className="scroll-arrow-btn" onClick={() => handleTimeArrow(-1)}>
                  <ChevronLeft />
                </button>
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
                <button className="scroll-arrow-btn" onClick={() => handleTimeArrow(1)}>
                  <ChevronRight />
                </button>
              </div>
            )}
            </div>

            {/* 4. Options (Checkbox / Register) */}
            <div className="options-row-bottom panel-section">
              {mode === 'crawl' ? (
                <label className="checkbox-label" htmlFor="all-times-checkbox">
                  <input
                    type="checkbox"
                    id="all-times-checkbox"
                    className="checkbox-input"
                    checked={allTimes}
                    onChange={(e) => setAllTimes(e.target.checked)}
                  />
                  모든시간 표시
                </label>
              ) : (
                <div className="internal-actions-row">
                  <button className="add-program-btn full-width-btn" onClick={() => setShowAddModal(true)} title="사내 편성 추가">
                    <Plus size={16} />
                    <span>새 편성 등록</span>
                  </button>
                </div>
              )}
            </div>

            {/* 5. Difference summary box */}
            {mode === 'internal' && (excludedItems.length > 0 || addedItems.length > 0) && (
              <div className="diff-summary-box panel-section" style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                {excludedItems.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 600, border: '1px solid rgba(239,68,68,0.3)', padding: '0.1rem 0.3rem', borderRadius: '4px', display: 'inline-block', marginBottom: '0.3rem' }}>공식 웹 제외</span>
                    <ul style={{ listStyleType: 'none', margin: 0, padding: 0, fontSize: '0.75rem', color: '#475569' }}>
                      {excludedItems.map(p => <li key={p.prdid} style={{ marginBottom: '0.2rem' }}>• {p.mappedName || p.prdid}</li>)}
                    </ul>
                  </div>
                )}
                {addedItems.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#3b82f6', fontWeight: 600, border: '1px solid rgba(59,130,246,0.3)', padding: '0.1rem 0.3rem', borderRadius: '4px', display: 'inline-block', marginBottom: '0.3rem' }}>공식 웹 추가</span>
                    <ul style={{ listStyleType: 'none', margin: 0, padding: 0, fontSize: '0.75rem', color: '#475569' }}>
                      {addedItems.map(p => <li key={p.prdid} style={{ marginBottom: '0.2rem' }}>• {p.mappedName || p.prdid}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* MOBILE LAYOUT (Original compact layout) */}
            <div className="date-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div className="date-scroll-wrapper" ref={dateScrollRef} style={{ flex: 1, marginRight: '0.5rem', marginBottom: 0 }}>
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
              <button 
                className="mode-toggle-btn" 
                onClick={() => setMode(prev => prev === 'crawl' ? 'internal' : 'crawl')} 
                title={mode === 'crawl' ? '세일즈온 등록정보로 전환' : 'GS SHOP 보기로 전환'}
                style={{ padding: '0.6rem', flexShrink: 0, minWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <RefreshCw size={18} />
              </button>
            </div>
            
            <div className="time-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="time-seamless-track" ref={timeScrollRef} style={{ flex: 1, marginRight: '0.5rem' }}>
                {availablePrograms.map(p => {
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
              
              <div className="header-options" style={{ flexShrink: 0 }}>
                {mode === 'crawl' ? (
                  <label className="checkbox-label" style={{ fontSize: '0.75rem', padding: 0 }}>
                    <input type="checkbox" checked={allTimes} onChange={(e) => setAllTimes(e.target.checked)} className="checkbox-input" />
                    모든시간
                  </label>
                ) : (
                  <button className="add-program-btn" onClick={() => setShowAddModal(true)} style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px' }} title="새 편성 등록">
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Program broadcasting Name */}
      {activeProgram && (
        <div className="broadcast-header">
          {/* Left: Date + Time block */}
          <div className="broadcast-datetime">
            <span className="broadcast-date">{formatHeaderDate(activeProgram.date)}</span>
            <span className="broadcast-time-text">{activeProgram.broadcast_time}</span>
          </div>
          {/* Vertical divider */}
          <div className="broadcast-divider" />
          {/* Right: Program name block */}
          <div className="broadcast-program">
            <span className="broadcast-program-title">
              <FlowerIcon seed={activeProgram.pgmId} />
              {cleanProgramTitle(activeProgram.pgmTitle, mode, isDesktop)}
            </span>
            {(activeProgram.location || activeProgram.pd || activeProgram.hosts) && (
              <div className="broadcast-meta-badges">
                {activeProgram.location && (
                  <span className="meta-badge" title="스튜디오">{activeProgram.location}</span>
                )}
                {activeProgram.pd && (
                  <span className="meta-badge" title="PD">{activeProgram.pd}</span>
                )}
                {activeProgram.hosts && (
                  <span className="meta-badge" title="호스트">{activeProgram.hosts}</span>
                )}
              </div>
            )}
          </div>
        </div>
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
          className={`product-grid ${activeProducts.filter(p => mode === 'internal' || p.isOurProduct || allTimes).length > 12 ? 'print-4-cols' : 'print-fit-page'}`}
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
          <button className="stock-page-close-btn" onClick={closeStockPage}>
            <X size={24} />
          </button>
          
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
              <div className="stock-page-title-row">
                <h4 className="stock-page-product-title">{selectedProduct.mappedName}</h4>
                <span className="stock-page-code">{selectedProduct.prdid}</span>
              </div>
              {selectedProduct.location && (
                <div className="stock-page-location-row">
                  <span className="stock-page-location">
                    {selectedProduct.location}
                  </span>
                </div>
              )}
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
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowHourPicker(false); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">사내 편성 정보 등록</h3>
              <button className="modal-close-btn" onClick={() => { setShowAddModal(false); setShowHourPicker(false); }}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveInternal}>
              <div className="form-group">
                <label className="form-label">방송일 선택</label>
                <input 
                  type="date" 
                  className={`form-input${formData.date ? '' : ' date-empty'}`}
                  required 
                  value={formData.date} 
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">방송시간 선택</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
                  {/* Hour picker trigger */}
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="form-input"
                      style={{ width: '5rem', textAlign: 'center', cursor: 'pointer', background: '#fff', border: '1px solid #d1d5db', borderRadius: '0.5rem', padding: '0.5rem', fontWeight: 600, fontSize: '1rem', color: formData.hour ? '#1e293b' : '#9ca3af' }}
                      onClick={() => setShowHourPicker(p => !p)}
                    >
                      {formData.hour !== '' ? formData.hour : '시'}
                    </button>
                    {showHourPicker && (
                      <>
                        {/* backdrop */}
                        <div
                          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                          onClick={() => setShowHourPicker(false)}
                        />
                        <div style={{
                          position: 'absolute', top: '110%', left: 0,
                          background: '#fff', border: '1px solid #e2e8f0',
                          borderRadius: '0.75rem', boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                          zIndex: 9999, padding: '0.5rem', width: '210px'
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                          {Array.from({ length: 19 }, (_, i) => i + 6).map(h => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => { setFormData(prev => ({ ...prev, hour: String(h) })); setShowHourPicker(false); }}
                              style={{
                                padding: '0.35rem 0',
                                borderRadius: '0.4rem',
                                border: 'none',
                                background: formData.hour === String(h) ? 'var(--accent-primary)' : '#f1f5f9',
                                color: formData.hour === String(h) ? '#fff' : '#1e293b',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                            >
                              {h}
                            </button>
                          ))}
                        </div>
                        </div>
                      </>
                    )}
                  </div>
                  <span style={{ fontWeight: 'bold' }}>:</span>
                  <input 
                    type="number" 
                    className="form-input"
                    style={{ width: '5rem', textAlign: 'center' }}
                    placeholder="분"
                    min="0"
                    max="59"
                    required 
                    value={formData.minute} 
                    onChange={e => setFormData(prev => ({ ...prev, minute: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">사내 데이터 입력란 (엑셀 셀 붙여넣기)</label>
                <textarea 
                  className="form-textarea"
                  required
                  placeholder="사내 프로그램 엑셀 복사/붙여넣기"
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
                <button type="button" className="btn-cancel" onClick={() => { setShowAddModal(false); setShowHourPicker(false); }}>
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
