import sys
import io
import csv
import os
import json
import re

# Set console output encoding to UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def main():
    service_key = os.environ.get("GCP_SERVICE_ACCOUNT_KEY")
    spreadsheet_id = os.environ.get("SPREADSHEET_ID")
    
    if not service_key:
        print("[오류] GCP_SERVICE_ACCOUNT_KEY 환경 변수가 설정되지 않았습니다.")
        sys.exit(1)
    if not spreadsheet_id:
        print("[오류] SPREADSHEET_ID 환경 변수가 설정되지 않았습니다.")
        sys.exit(1)
        
    # Extract Spreadsheet ID if a full URL was supplied
    if "docs.google.com/spreadsheets" in str(spreadsheet_id):
        match = re.search(r"/d/([a-zA-Z0-9-_]+)", spreadsheet_id)
        if match:
            spreadsheet_id = match.group(1)

    print("Google Sheets 동기화 시작...")
    
    try:
        import gspread
        from google.oauth2.service_account import Credentials
    except ImportError:
        print("[오류] Google Sheet 라이브러리(gspread, google-auth)가 설치되어 있지 않습니다.")
        sys.exit(1)

    try:
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        
        # Parse credential JSON and authorize
        key_data = json.loads(service_key)
        creds = Credentials.from_service_account_info(key_data, scopes=scopes)
        client = gspread.authorize(creds)
        
        print(f"구글 스프레드시트 연결 시도 중 (ID: {spreadsheet_id})...")
        spreadsheet = client.open_by_key(spreadsheet_id)
        
        # Mapping worksheets in Google Sheet to local CSV files
        sheet_mapping = {
            "LIVE": "live.csv",
            "이미지": "image.csv",
            "RAW": "raw.csv",
            "MLIVE": "mlive.csv"
        }
        
        # Target local directory path (web-app/public/data/)
        target_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web-app", "public", "data")
        os.makedirs(target_dir, exist_ok=True)
        
        for sheet_name, filename in sheet_mapping.items():
            print(f"\n  워크시트 '{sheet_name}' 다운로드 중...")
            try:
                worksheet = spreadsheet.worksheet(sheet_name)
                all_values = worksheet.get_all_values()
                
                if not all_values:
                    print(f"    [경고] 워크시트 '{sheet_name}'이(가) 비어 있습니다. 파일 생성을 건너뜁니다.")
                    continue
                    
                dest_path = os.path.join(target_dir, filename)
                with open(dest_path, "w", newline="", encoding="utf-8-sig") as f:
                    writer = csv.writer(f)
                    writer.writerows(all_values)
                print(f"    [성공] '{dest_path}' 저장 완료 (총 {len(all_values)}행)")
            except gspread.exceptions.WorksheetNotFound:
                print(f"    [오류] 워크시트 '{sheet_name}'을(를) 찾을 수 없습니다.")
            except Exception as e:
                print(f"    [오류] 워크시트 '{sheet_name}' 처리 중 에러: {e}")
                
        print("\n모든 구글 시트 동기화 완료!")
    except Exception as e:
        print(f"\n[동기화 실패] 에러 사유: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
