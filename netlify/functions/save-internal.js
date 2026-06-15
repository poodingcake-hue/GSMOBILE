// Netlify Serverless Function: save-internal
// 브라우저에서 전달받은 편성 데이터를 GitHub REST API로 저장합니다.
// GitHub 토큰은 Netlify 환경변수(GITHUB_TOKEN)에 안전하게 보관됩니다.

export default async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 서버 환경변수에서 토큰 읽기 (절대 브라우저에 노출되지 않음)
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER || 'poodingcake-hue';
  const GITHUB_REPO = process.env.GITHUB_REPO || 'GSMOBILE';

  if (!GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: 'GitHub 토큰이 서버에 설정되지 않았습니다. Netlify 환경변수를 확인하세요.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '잘못된 요청 형식입니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const { date, broadcast_time, pgmTitle, location, pd, hosts, productIds } = body;

  if (!date || !broadcast_time || !pgmTitle) {
    return new Response(JSON.stringify({ error: '필수 항목(날짜, 시간, 방송명)이 누락되었습니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const date_str = date.replace(/-/g, '');
  const pgmId = `internal_${Date.now()}`;
  const filePath = 'web-app/public/data/internal.csv';
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // 1. 기존 파일 조회
  let sha = null;
  let existingText = '';

  try {
    const getRes = await fetch(apiUrl, { headers });
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
      const base64Clean = fileData.content.replace(/\s/g, '');
      existingText = decodeURIComponent(
        atob(base64Clean).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
    } else if (getRes.status !== 404) {
      const errData = await getRes.json().catch(() => ({}));
      throw new Error(`GitHub 파일 조회 실패 (${getRes.status}): ${errData.message || getRes.statusText}`);
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: `GitHub 연결 오류: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 2. CSV 내용 준비
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  let updatedCsv = existingText
    ? (existingText.endsWith('\n') ? existingText : existingText + '\n')
    : '\uFEFFdate,date_str,broadcast_time,pgmId,pgmTitle,location,pd,hosts,prdid,title,url\n';

  const products = productIds && productIds.length > 0 ? productIds : [''];
  products.forEach(prdid => {
    const url = prdid ? `https://m.gsshop.com/prd/prd.gs?prdid=${prdid}` : '';
    updatedCsv += `${date},${date_str},${broadcast_time},${pgmId},${escapeCsv(pgmTitle)},${escapeCsv(location)},${escapeCsv(pd)},${escapeCsv(hosts)},${escapeCsv(prdid)},,${url}\n`;
  });

  // 3. GitHub에 PUT
  const base64Content = btoa(unescape(encodeURIComponent(updatedCsv)));

  try {
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `data: update internal schedule from browser [skip ci]`,
        content: base64Content,
        sha: sha || undefined,
      }),
    });

    if (!putRes.ok) {
      const putData = await putRes.json().catch(() => ({}));
      throw new Error(`GitHub 저장 실패 (${putRes.status}): ${putData.message || putRes.statusText}`);
    }

    return new Response(JSON.stringify({ success: true, message: '저장 완료!', pgmId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};

export const config = {
  path: '/api/save-internal',
};
