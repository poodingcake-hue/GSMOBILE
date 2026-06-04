"""
GS Shop 편성표 > MOBILE LIVE 상세 상품 크롤러 v9.1
- 1단계: 4일치 편성표를 돌며 유니크한 (date, date_str, pgmId, broadcast_time) 목록 수집
- 2단계: 각 pgmId에 해당하는 프로그램 상세 페이지로 개별 접속
- 3단계: 상세 페이지 타이틀 추출 및 시간값 부재 시 상세 페이지 배지 정보로 복원
- 4단계: 시간값에서 "오늘", "내일", 날짜 정보 등을 필터링하고 순수 HH:MM 형태로만 정제 저장
- 5단계: Google Sheet 연동 및 로컬 CSV 저장 (하이브리드 지원)
"""
import sys, io, time, csv, os, json, re
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, UnexpectedAlertPresentException, NoAlertPresentException

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ── 설정 ────────────────────────────────────────────────
DAYS_TO_CRAWL = 4
OUTPUT_FILE   = "gsshop_mobile_live_products.csv"  # 로컬 저장용 파일명
WAIT_SEC      = 15
SCROLL_PAUSE  = 1.0
MAIN_URL      = "https://m.gsshop.com/index.gs"
# ────────────────────────────────────────────────────────


def build_driver(headless=False):
    opts = Options()
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Linux; Android 13; Pixel 7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Mobile Safari/537.36"
    )
    opts.add_argument("--window-size=412,915")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    
    # GitHub Actions 환경(Linux 러너)인 경우 강제 headless 설정
    is_github_actions = os.environ.get("GITHUB_ACTIONS") == "true"
    if headless or is_github_actions:
        print("  [러너 설정] Headless Chrome 구동 (Sandbox 비활성화)")
        opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--disable-gpu")
        
    driver = webdriver.Chrome(options=opts)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"},
    )
    return driver


def handle_alert(driver):
    """예기치 못한 얼럿(예: 상담 불가 팝업 등) 발생 시 안전하게 닫기"""
    try:
        alert = driver.switch_to.alert
        alert_text = alert.text
        print(f"  [얼럿 감지 및 닫기] {alert_text.replace(chr(10), ' ')}")
        alert.accept()
        return True
    except NoAlertPresentException:
        return False


def click_element(driver, el, desc=""):
    """JS 클릭 (일반 클릭 실패 대비)"""
    try:
        el.click()
    except Exception:
        try:
            driver.execute_script("arguments[0].click();", el)
        except UnexpectedAlertPresentException:
            handle_alert(driver)
            driver.execute_script("arguments[0].click();", el)
    print(f"  [클릭] {desc}")
    time.sleep(2.0)


def goto_schedule_page(driver):
    """메인 페이지 접속 후 편성표 탭 클릭"""
    print(f"[1] 메인 페이지 접속: {MAIN_URL}")
    try:
        driver.get(MAIN_URL)
        time.sleep(4)
    except UnexpectedAlertPresentException:
        handle_alert(driver)
    
    handle_alert(driver)

    print("[2] 편성표 탭 탐색...")
    schedule_tab_strategies = [
        ("XPATH", "//*[text()='편성표']"),
        ("XPATH", "//*[contains(text(),'편성표')]"),
        ("XPATH", "//a[contains(@href,'schedule') or contains(@href,'Schedule')]"),
        ("XPATH", "//a[contains(@href,'broad')]"),
        ("CSS",   "[class*='schedule']"),
    ]

    for sel_type, sel in schedule_tab_strategies:
        try:
            by = By.CSS_SELECTOR if sel_type == "CSS" else By.XPATH
            els = driver.find_elements(by, sel)
            if els:
                txt = els[0].text.strip()
                click_element(driver, els[0], f"편성표 탭 ('{txt}')")
                return True
        except UnexpectedAlertPresentException:
            handle_alert(driver)
        except Exception as e:
            print(f"    후보 {sel} 시도 중 오류: {e}")
            
    print("  [경고] 편성표 탭 클릭에 실패하였습니다.")
    return False


def click_mobile_live_tab(driver):
    """MOBILE LIVE 서브탭 클릭"""
    print("[3] MOBILE LIVE 탭 탐색...")
    strategies = [
        ("XPATH", "//*[text()='MOBILE LIVE']"),
        ("XPATH", "//*[contains(text(),'MOBILE LIVE')]"),
        ("XPATH", "//*[text()='모바일 라이브']"),
        ("XPATH", "//*[contains(text(),'모바일')]"),
        ("CSS",   "[data-type='MOBILE_LIVE']"),
        ("CSS",   "[data-tab='mobileLive']"),
    ]
    for sel_type, sel in strategies:
        try:
            by = By.CSS_SELECTOR if sel_type == "CSS" else By.XPATH
            els = driver.find_elements(by, sel)
            if els:
                txt = els[0].text.strip()
                click_element(driver, els[0], f"MOBILE LIVE 탭 ('{txt}')")
                return True
        except UnexpectedAlertPresentException:
            handle_alert(driver)
        except Exception:
            pass

    print("  [경고] MOBILE LIVE 탭을 찾지 못했습니다.")
    return False


def click_date_tab_by_idx(driver, idx):
    """날짜 네비게이션 탭의 idx번째 요소를 클릭"""
    try:
        navis = driver.find_elements(By.CSS_SELECTOR, ".prd-schedule-navi a, .prd-schedule-navi button")
        if idx < len(navis):
            click_element(driver, navis[idx], f"날짜 탭 [{idx}] ('{navis[idx].text.strip().replace(chr(10), ' ')}')")
            return True
    except UnexpectedAlertPresentException:
        handle_alert(driver)
        try:
            navis = driver.find_elements(By.CSS_SELECTOR, ".prd-schedule-navi a, .prd-schedule-navi button")
            if idx < len(navis):
                click_element(driver, navis[idx], f"날짜 탭 [{idx}] (재시도)")
                return True
        except Exception:
            pass
    except Exception as e:
        print(f"  [경고] 날짜 탭 클릭 오류: {e}")
    return False


def scroll_to_bottom(driver):
    """레이지 로딩을 트리거하기 위해 페이지 끝까지 스크롤"""
    last_h = driver.execute_script("return document.body.scrollHeight")
    for _ in range(8):  # 최대 8회 스크롤
        try:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(SCROLL_PAUSE)
            new_h = driver.execute_script("return document.body.scrollHeight")
            if new_h == last_h:
                break
            last_h = new_h
        except UnexpectedAlertPresentException:
            handle_alert(driver)


def get_pgm_id_from_mix(mix_el):
    """mix 요소 내의 방송 정보 링크에서 pgmId 추출"""
    try:
        anchors = mix_el.find_elements(By.TAG_NAME, "a")
        for a in anchors:
            href = a.get_attribute("href") or ""
            if "pgmId=" in href or "pgmID=" in href:
                parsed_url = urlparse(href)
                query = parse_qs(parsed_url.query)
                for k, v in query.items():
                    if k.lower() == "pgmid":
                        return v[0]
    except Exception:
        pass
    return None


def clean_broadcast_time(raw_time):
    """오늘/내일 등 불필요한 단어를 제거하고 HH:MM 형식만 남김 (한글 '시 분' 지원, 카운트다운 타이머 제외)"""
    if not raw_time:
        return ""
    
    # "13:49:46"과 같은 남은 카운트다운 타이머(HH:MM:SS)는 실제 방송 시간이 아니므로 매칭에서 완전히 지워버립니다.
    cleaned_raw = re.sub(r"\d{1,2}:\d{2}:\d{2}", "", raw_time)
    
    # 1. "14시 00분", "9시 30분" 같은 한글 시간 패턴을 타이머보다 우선 추출
    match_ko = re.search(r"(\d{1,2})\s*시\s*(\d{2})\s*분", cleaned_raw)
    if match_ko:
        h, m = int(match_ko.group(1)), int(match_ko.group(2))
        return f"{h:02d}:{m:02d}"
        
    # 2. 남은 타이머를 제외한 상태에서 "20:00", "07:30" 같은 HH:MM 패턴 추출
    match = re.search(r"(\d{1,2}):(\d{2})", cleaned_raw)
    if match:
        h, m = int(match.group(1)), int(match.group(2))
        return f"{h:02d}:{m:02d}"
        
    return ""


def collect_pgm_list_by_dayidx(driver, day_idx, date_str, date_label):
    """
    편성표 페이지에서 각 날짜별 고유 pgmId 목록 수집 (시간 정보 포함)
    """
    pgm_items = []
    try:
        container = driver.find_element(By.CSS_SELECTOR, f".shoppy-schedule-data[data-dayidx='{day_idx}']")
    except NoSuchElementException:
        print(f"  [경고] 컨테이너(dayidx={day_idx})를 찾을 수 없습니다.")
        return pgm_items

    mix_articles = container.find_elements(By.CSS_SELECTOR, "article.prd-item.horizon.mix")
    for mix in mix_articles:
        pgm_id = get_pgm_id_from_mix(mix)
        
        # 방송 시간 추출
        broadcast_time = ""
        try:
            date_el = mix.find_element(By.CSS_SELECTOR, "p.date")
            broadcast_time = date_el.text.strip().replace("\n", " ")
        except Exception:
            try:
                time_el = mix.find_element(By.CSS_SELECTOR, ".badge-abs, [class*='time']")
                broadcast_time = time_el.text.strip().replace("\n", " ")
            except Exception:
                pass

        if pgm_id:
            pgm_items.append({
                "pgmId": pgm_id,
                "date": date_label,
                "date_str": date_str,
                "broadcast_time": broadcast_time
            })
    return pgm_items


def collect_products_from_program(driver, pgm_item):
    """
    각 pgmId 상세 페이지 접속 후 프로그램 타이틀(pgmTitle), 상품코드(prdid)와 상품명(title) 수집
    """
    products = []
    pgm_id = pgm_item["pgmId"]
    url = f"https://m.gsshop.com/shop/mobileLive/pgm?pgmId={pgm_id}"
    
    print(f"  => 프로그램 페이지 접속: {url}")
    try:
        driver.get(url)
        time.sleep(3.5)
    except UnexpectedAlertPresentException:
        handle_alert(driver)
    
    handle_alert(driver)

    # 프로그램 타이틀명 추출 (h2.ttl-lg)
    pgm_title = ""
    try:
        pgm_title_el = driver.find_element(By.CSS_SELECTOR, ".live-preview-head h2.ttl-lg, h2.ttl-lg, main#gs-contents h2")
        pgm_title = pgm_title_el.text.strip()
        print(f"     [타이틀 감지] {pgm_title}")
    except Exception as e:
        print(f"     [경고] 프로그램 타이틀 추출 불가: {e}")

    # 기존 편성표에서 획득한 시간이 비어있는 경우, 상세 페이지 내의 여러 요소에서 추가 탐색 시도
    broadcast_time = pgm_item.get("broadcast_time", "")
    if not broadcast_time or broadcast_time.strip() == "":
        time_selectors = [
            ".live-preview-head .badge-txt.date",
            ".badge-txt.date",
            ".ban-item",
            "[class*='ban-item']",
            "[class*='badge']",
            "[class*='date']",
            "[class*='time']"
        ]
        found_time_text = ""
        for sel in time_selectors:
            try:
                els = driver.find_elements(By.CSS_SELECTOR, sel)
                for el in els:
                    txt = el.text.strip().replace("\n", " ")
                    # 시간 패턴이 들어있는지 체크 (HH:MM 혹은 H시 M분)
                    if txt and (re.search(r"\d{1,2}:\d{2}", txt) or re.search(r"\d{1,2}\s*시\s*\d{2}\s*분", txt)):
                        found_time_text = txt
                        break
                if found_time_text:
                    break
            except Exception:
                pass
        
        if found_time_text:
            broadcast_time = found_time_text
            print(f"     [시간 정보 복원 완료] => {broadcast_time}")

    # 시간 정제 (오늘/내일 등 불필요 단어 제거 후 HH:MM만 추출)
    clean_time = clean_broadcast_time(broadcast_time)
    print(f"     [최종 정제 시간] => {clean_time if clean_time else '(없음)'}")

    # 스크롤 다운을 통해 아래 상품 정보 로딩 유도
    scroll_to_bottom(driver)
    time.sleep(1.0)

    # article.prd-item 혹은 data-prdcd 속성을 가진 요소를 찾아냄
    items = driver.find_elements(By.CSS_SELECTOR, "article[data-prdcd], [class*='prd-item'][data-prdcd]")
    
    if not items:
        items = driver.find_elements(By.CSS_SELECTOR, "[data-prdcd]")

    print(f"     발견된 상품 요소: {len(items)}개")

    for item in items:
        try:
            prdcd = item.get_attribute("data-prdcd")
            if not prdcd:
                continue

            # 상품명 추출
            title = ""
            try:
                title = item.find_element(By.CSS_SELECTOR, "span.prd-name").text.strip()
            except Exception:
                try:
                    title = item.find_element(By.CSS_SELECTOR, ".prd-name").text.strip()
                except Exception:
                    try:
                        title = item.find_element(By.CSS_SELECTOR, "dt.prd-copy").text.strip()
                    except Exception:
                        title = item.text.strip()

            # 상품 주소 추출
            prd_url = ""
            try:
                a_link = item.find_element(By.CSS_SELECTOR, "a.prd-link")
                prd_url = (a_link.get_attribute("href") or "").strip()
            except Exception:
                pass

            if not prd_url:
                prd_url = f"https://m.gsshop.com/prd/prd.gs?prdid={prdcd}"
            elif prd_url.startswith("/"):
                prd_url = "https://m.gsshop.com" + prd_url

            # url에 pgmID 파라미터가 없으면 추가
            if "pgmID=" not in prd_url and "pgmId=" not in prd_url:
                prd_url = f"{prd_url}&pgmID={pgm_id}" if "?" in prd_url else f"{prd_url}?pgmID={pgm_id}"

            products.append({
                "date": pgm_item["date"],
                "date_str": pgm_item["date_str"],
                "broadcast_time": clean_time,
                "pgmId": pgm_id,
                "pgmTitle": pgm_title,
                "prdid": prdcd,
                "title": title[:100],
                "url": prd_url
            })
        except Exception as e:
            print(f"     [상세 파싱 에러] {e}")

    return products


def save_to_google_sheet(service_key_json, sheet_id, data_list):
    """구글 스프레드시트에 수집된 데이터를 누적 저장 (시간 정보 포함)"""
    # 만약 sheet_id에 스프레드시트 URL 전체를 넣었을 경우, ID 부분만 정규식으로 자동 추출
    if "docs.google.com/spreadsheets" in str(sheet_id):
        match = re.search(r"/d/([a-zA-Z0-9-_]+)", sheet_id)
        if match:
            sheet_id = match.group(1)

    try:
        import gspread
        from google.oauth2.service_account import Credentials
    except ImportError:
        print("[오류] Google Sheet 라이브러리(gspread, google-auth)가 설치되어 있지 않습니다. 로컬 저장을 수행합니다.")
        return False

    try:
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        # JSON 키 파싱 및 크레덴셜 생성
        key_data = json.loads(service_key_json)
        creds = Credentials.from_service_account_info(key_data, scopes=scopes)
        client = gspread.authorize(creds)
        
        # 시트 열기
        spreadsheet = client.open_by_key(sheet_id)
        sheet = spreadsheet.sheet1
        
        # 헤더가 비어있을 경우 생성
        existing_records = sheet.get_all_values()
        if not existing_records:
            sheet.append_row(["date", "date_str", "broadcast_time", "pgmId", "pgmTitle", "prdid", "title", "url"])
            print("  [구글 시트] 신규 시트에 헤더 생성 완료")
            existing_records = [[]]

        # 중복 방지를 위해 이미 기록된 (pgmId, prdid) 매핑 쌍 확보
        logged_keys = set()
        for idx, row in enumerate(existing_records):
            if idx == 0:  # 헤더 스킵
                continue
            if len(row) >= 6:
                logged_keys.add((row[3], row[5]))  # pgmId(인덱스 3), prdid(인덱스 5)

        # 신규 추가할 행 필터링 및 리스트 생성
        rows_to_append = []
        new_count = 0
        for item in data_list:
            key = (item["pgmId"], item["prdid"])
            if key not in logged_keys:
                rows_to_append.append([
                    item["date"],
                    item["date_str"],
                    item["broadcast_time"],
                    item["pgmId"],
                    item["pgmTitle"],
                    item["prdid"],
                    item["title"],
                    item["url"]
                ])
                new_count += 1

        if rows_to_append:
            sheet.append_rows(rows_to_append)
            print(f"  [구글 시트] 신규 상품 {new_count}건 누적 저장 완료! (중복 제거 적용)")
        else:
            print("  [구글 시트] 추가할 새로운 신규 상품이 없습니다. (모든 데이터 중복)")
        
        return True
    except Exception as e:
        print(f"[구글 시트 저장 실패] 에러 사유: {e}")
        return False


def main():
    today = datetime.now()
    dates  = [(today + timedelta(days=i)).strftime("%Y%m%d") for i in range(DAYS_TO_CRAWL)]
    labels = [(today + timedelta(days=i)).strftime("%Y-%m-%d (%a)") for i in range(DAYS_TO_CRAWL)]

    print("GS Shop MOBILE LIVE 상세 상품 수집기 v9.1 (시간 정제 & 복원)")
    print(f"대상 날짜: {', '.join(labels)}")
    print(f"로컬 백업 저장: {OUTPUT_FILE}\n")

    driver = build_driver(headless=False)
    all_pgm_items = []
    final_products = []

    try:
        # ==========================================
        # Step 1: 편성표 페이지 진입 후 고유 pgmId 목록 수집
        # ==========================================
        if not goto_schedule_page(driver):
            print("편성표 페이지 진입 불가로 종료합니다.")
            return
        
        click_mobile_live_tab(driver)
        time.sleep(3)

        for idx in range(DAYS_TO_CRAWL):
            date_str = dates[idx]
            date_label = labels[idx]

            print(f"\n[편성표 조회] {date_label} ({date_str}) 날짜 탭 클릭 중...")
            click_date_tab_by_idx(driver, idx)
            time.sleep(2)
            scroll_to_bottom(driver)
            time.sleep(1.5)

            pgms = collect_pgm_list_by_dayidx(driver, idx, date_str, date_label)
            print(f"  => 발견된 pgmId 개수: {len(pgms)}개")
            all_pgm_items.extend(pgms)

        # pgmId 기준 중복 제거
        seen_pgms = set()
        unique_pgm_items = []
        for item in all_pgm_items:
            if item["pgmId"] not in seen_pgms:
                seen_pgms.add(item["pgmId"])
                unique_pgm_items.append(item)

        print(f"\n[중복 제거 완료] 고유 pgmId 수: {len(unique_pgm_items)}개")
        for i, item in enumerate(unique_pgm_items, 1):
            time_str = item.get("broadcast_time") or "-"
            print(f"  [{i:02d}] {item['date']} | 시간={time_str} | pgmId={item['pgmId']}")

        # ==========================================
        # Step 2: 각 pgmId 상세 페이지 접속 및 상품 정보 수집
        # ==========================================
        print(f"\n{'='*60}")
        print("  프로그램 상세 페이지 진입 및 상품 정보 수집 시작")
        print(f"{'='*60}")

        for idx, pgm_item in enumerate(unique_pgm_items, 1):
            print(f"\n[{idx}/{len(unique_pgm_items)}] pgmId: {pgm_item['pgmId']} ({pgm_item['date']})")
            try:
                products = collect_products_from_program(driver, pgm_item)
                print(f"     => 수집 완료 상품 수: {len(products)}개")
                final_products.extend(products)
            except Exception as e:
                print(f"     [오류] 프로그램 {pgm_item['pgmId']} 처리 중 예외 발생: {e}")
            time.sleep(2.0)

    except Exception as e:
        print(f"\n[오류 발생] {e}")
        import traceback
        traceback.print_exc()

    finally:
        driver.quit()

    # 중복 방지를 위한 디듀플리케이션 (pgmId, prdid 기준)
    unique_products = []
    if final_products:
        seen_keys = set()
        for r in final_products:
            key = (r['pgmId'], r['prdid'])
            if key not in seen_keys:
                seen_keys.add(key)
                unique_products.append(r)

    # ==========================================
    # Step 3: 데이터 저장 (Google Sheets / 로컬 CSV)
    # ==========================================
    service_key = os.environ.get("GCP_SERVICE_ACCOUNT_KEY")
    spreadsheet_id = os.environ.get("SPREADSHEET_ID")

    sheet_saved = False
    if service_key and spreadsheet_id:
        print(f"\n[데이터 저장] 구글 스프레드시트({spreadsheet_id}) 누적 업로드 진행 중...")
        sheet_saved = save_to_google_sheet(service_key, spreadsheet_id, unique_products)

    # 로컬 백업 CSV 저장
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), OUTPUT_FILE)
    if unique_products:
        with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(
                f, fieldnames=["date","date_str","broadcast_time","pgmId","pgmTitle","prdid","title","url"])
            writer.writeheader()
            writer.writerows(unique_products)
        print(f"\n[로컬 백업 완료] 저장 완료: {output_path}")
        print(f"총 {len(unique_products)}개 상품 매핑 완료")
    else:
        print("\n수집된 데이터가 없습니다.")


if __name__ == "__main__":
    main()
