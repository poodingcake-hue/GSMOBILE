import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  X,
  Database,
  Grid,
  RefreshCw
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

// Format date string YYYY-MM-DD H:MM to DD/HH:MM
function formatLiveDate(rawDateStr) {
  if (!rawDateStr) return '';
  const parts = rawDateStr.trim().split(' ');
  if (parts.length >= 2) {
    const datePart = parts[0]; // YYYY-MM-DD
    const timePart = parts[1]; // H:MM or HH:MM
    
    const dateSub = datePart.split('-');
    const day = dateSub.length >= 3 ? dateSub[2] : datePart;
    
    const timeSub = timePart.split(':');
    const hour = timeSub[0].padStart(2, '0');
    const min = timeSub.length >= 2 ? timeSub[1].padStart(2, '0') : '00';
    
    return `${day}/${hour}:${min}`;
  }
  return rawDateStr;
}

function App() {
  // Raw parsed datasets
  const [mliveData, setMliveData] = useState([]);
  const [liveData, setLiveData] = useState([]);
  const [imageData, setImageData] = useState([]);
  const [rawData, setRawData] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Navigation & filter states
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [allTimes, setAllTimes] = useState(false);
  
  // Modal state
  const [selectedProduct, setSelectedProduct] = useState(null);

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
      })
    ])
      .then(([mliveText, liveText, imageText, rawText]) => {
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

        // Auto-select the first date
        if (mliveList.length > 0) {
          const uniqueDates = [...new Set(mliveList.map(item => item.date))].sort();
          if (uniqueDates.length > 0) {
            setSelectedDate(uniqueDates[0]);
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
    if (imageData.length === 0) return { prdid: 0, url: 2 };
    const headers = imageData[0].map(h => h.toLowerCase());
    
    let prdIdx = headers.findIndex(h => h.includes('코드') || h.includes('prdid') || h.includes('상품코드'));
    let urlIdx = headers.findIndex(h => h.includes('이미지') || h.includes('url') || h.includes('주소') || h.includes('image'));
    
    if (prdIdx === -1) prdIdx = 0;
    if (urlIdx === -1) urlIdx = 2;
    
    return { prdid: prdIdx, url: urlIdx };
  }, [imageData]);

  // Make set of RAW inventory product IDs to identify "our products"
  const ourProductIds = useMemo(() => {
    if (rawData.length <= 1) return new Set();
    const idx = rawColumnIndices.prdid;
    return new Set(rawData.slice(1).map(row => row[idx]).filter(Boolean));
  }, [rawData, rawColumnIndices]);

  // Group MLIVE entries by broadcast hour for selected date
  const selectedDatePrograms = useMemo(() => {
    if (!selectedDate) return [];
    
    const progMap = {};
    mliveData.forEach(item => {
      if (item.date !== selectedDate) return;
      const key = `${item.broadcast_time}_${item.pgmId}`;
      if (!progMap[key]) {
        progMap[key] = {
          pgmId: item.pgmId,
          pgmTitle: item.pgmTitle,
          broadcast_time: item.broadcast_time,
          date: item.date,
          products: []
        };
      }
      progMap[key].products.push(item);
    });
    
    const list = Object.values(progMap).sort((a, b) => a.broadcast_time.localeCompare(b.broadcast_time));
    
    if (allTimes) {
      return list;
    } else {
      // Show only times that contain at least one product matching raw.csv
      return list.filter(prog => 
        prog.products.some(p => ourProductIds.has(p.prdid))
      );
    }
  }, [mliveData, selectedDate, allTimes, ourProductIds]);

  // Extract unique dates for tab rendering
  const uniqueDates = useMemo(() => {
    return [...new Set(mliveData.map(p => p.date))].sort();
  }, [mliveData]);

  // Extract available times for selected date
  const availableTimes = useMemo(() => {
    return selectedDatePrograms.map(p => p.broadcast_time);
  }, [selectedDatePrograms]);

  // Automatically select the first available time when selectedDate or allTimes changes
  useEffect(() => {
    if (availableTimes.length > 0) {
      if (!availableTimes.includes(selectedTime)) {
        setSelectedTime(availableTimes[0]);
      }
    } else {
      setSelectedTime('');
    }
  }, [availableTimes, selectedTime]);

  // Find the currently selected program block
  const activeProgram = useMemo(() => {
    return selectedDatePrograms.find(p => p.broadcast_time === selectedTime) || null;
  }, [selectedDatePrograms, selectedTime]);

  // Map product elements for the active program
  const activeProducts = useMemo(() => {
    if (!activeProgram) return [];
    
    return activeProgram.products.map(p => {
      const prdid = p.prdid;
      
      // 1. Mapped product name (from raw.csv, fall back to mlive)
      let name = p.title;
      let location = '';
      if (rawData.length > 1) {
        const foundInv = rawData.slice(1).find(row => row[rawColumnIndices.prdid] === prdid);
        if (foundInv) {
          name = foundInv[rawColumnIndices.name];
          location = foundInv[rawColumnIndices.location];
        }
      }
      
      // 2. Mapped image URL
      let imageUrl = '';
      if (imageData.length > 1) {
        const foundImg = imageData.slice(1).find(row => row[imageColumnIndices.prdid] === prdid);
        if (foundImg) {
          imageUrl = getGoogleDriveDirectLink(foundImg[imageColumnIndices.url]);
        }
      }
      
      // 3. Mapped live dates (format to DD/HH:MM)
      const liveTimes = [];
      if (liveData.length > 1) {
        liveData.slice(1).forEach(row => {
          if (row[liveColumnIndices.prdid] === prdid) {
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
        liveTimes,
        isOurProduct: ourProductIds.has(prdid)
      };
    });
  }, [activeProgram, rawData, imageData, liveData, rawColumnIndices, imageColumnIndices, liveColumnIndices, ourProductIds]);

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
      {/* 1. Date Selector Tabs (Top) */}
      <section className="date-scroll-wrapper">
        {uniqueDates.map(date => {
          const isActive = selectedDate === date;
          
          // Format date (e.g. 2026-06-05 -> 5)
          const dateObj = new Date(date);
          const dayNumber = dateObj.getDate();
          
          // Get Korean weekday name
          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
          const weekdayName = weekdays[dateObj.getDay()];

          return (
            <button
              key={date}
              className={`date-card ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedDate(date)}
            >
              <span className="date-card-day-name">{weekdayName}</span>
              <span className="date-card-day-number">{dayNumber}</span>
            </button>
          );
        })}
      </section>

      {/* 2. Time selector & Checkbox section */}
      <section className="time-filter-section">
        <div className="time-list-container">
          {availableTimes.map(time => (
            <button
              key={time}
              className={`time-btn ${selectedTime === time ? 'active' : ''}`}
              onClick={() => setSelectedTime(time)}
            >
              {time}
            </button>
          ))}
        </div>
        
        {/* Toggle Checkbox for All Times */}
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
      </section>

      {/* 3. Program broadcasting Name */}
      {activeProgram && (
        <h2 className="broadcast-header">
          {activeProgram.broadcast_time} 방송 — {activeProgram.pgmTitle || '모바일 라이브'}
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
        <main className="product-grid">
          {activeProducts.map(product => {
            const isExcluded = product.status === '편성제외';
            const showCard = product.isOurProduct || allTimes;
            
            if (!showCard) return null;

            return (
              <div 
                key={product.prdid} 
                className={`product-card ${isExcluded ? 'excluded-state' : ''}`}
                onClick={() => product.isOurProduct && setSelectedProduct(product)}
                style={{ cursor: product.isOurProduct ? 'pointer' : 'default' }}
              >
                {/* 3:3.4 Image Layout */}
                <div className="product-img-layout-3-3_4">
                  {/* 3:3 Image Box */}
                  <div className="product-img-box-3-3">
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
                        {product.liveTimes.map((lt, idx) => (
                          <span key={idx} className="overlay-date-badge">
                            {lt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Location Box */}
                  <div className="product-loc-box-3-1">
                    {product.location ? (
                      <span className="product-loc-text">{product.location}</span>
                    ) : (
                      <span className="product-loc-empty">-</span>
                    )}
                  </div>
                </div>

                {/* Info body (Product Name & Status below 3:3.4 container) */}
                <div className="product-info-body">
                  <h3 className="product-title" title={product.mappedName}>
                    {product.mappedName}
                  </h3>
                  
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

      {/* 5. Inventory Modal Overlay */}
      {selectedProduct && (
        <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">재고 수량 확인</h3>
              <button className="modal-close-btn" onClick={() => setSelectedProduct(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              {/* Product summary block */}
              <div className="modal-product-summary">
                <div className="modal-product-img-box">
                  {selectedProduct.imageUrl ? (
                    <img 
                      src={selectedProduct.imageUrl} 
                      className="modal-product-img" 
                      alt={selectedProduct.mappedName} 
                    />
                  ) : (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>이미지 없음</span>
                  )}
                </div>
                <div className="modal-product-details">
                  <h4 className="modal-product-title">{selectedProduct.mappedName}</h4>
                  <span className="modal-product-code">상품코드: {selectedProduct.prdid}</span>
                  {selectedProduct.location && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-teal)', fontWeight: 600 }}>
                      보관위치: {selectedProduct.location}
                    </span>
                  )}
                </div>
              </div>

              {/* 2D Stock Matrix table */}
              {matrixData.colors.length > 0 ? (
                <div className="matrix-table-container">
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th>색상</th>
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
        </div>
      )}
    </div>
  );
}

export default App;
