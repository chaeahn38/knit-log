/**
 * Knit Log ↔ Google Sheet 연동 스크립트
 *
 * 설치 방법
 * 1) 새 Google Sheet를 만들고, 시트 이름을 "Log" 로 둡니다(기본 Sheet1 이름을 Log로 변경).
 * 2) 확장 프로그램 → Apps Script 를 열고, 기본 코드를 지운 뒤 이 파일 전체를 붙여넣습니다.
 * 3) 상단의 "배포" → "새 배포" → 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 전체 허용(Anyone)
 *    를 선택 후 배포합니다.
 * 4) 배포 후 나오는 웹 앱 URL(.../exec)을 knit-log.html 상단의
 *    "Apps Script Web App URL" 칸에 붙여넣으세요.
 *
 * "Projects" 시트는 첫 실행 시 자동으로 생성됩니다 (in-progress / completed
 * 프로젝트의 메타데이터를 저장해 브라우저를 바꿔도 유지되도록 함).
 */

const SHEET_NAME = 'Log';
const HEADERS = [
  'timestamp','project','startLength','endLength','lengthToday','gauge',
  'targetLength','remainingLength','durationMin','yarnColor','yarnColorName',
  'needleSize','method','technique','cityCountry'
];

const PROJECTS_SHEET_NAME = 'Projects';
const PROJECT_HEADERS = [
  'name','status','gauge','targetLength','yarnColor','yarnColorName',
  'needleSize','method','technique','cityCountry'
];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getProjectsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROJECTS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PROJECTS_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(PROJECT_HEADERS);
  }
  return sheet;
}

function doGet(e) {
  const action = (e.parameter.action || 'list');
  if (action === 'list') {
    const sheet = getSheet_();
    const values = sheet.getDataRange().getValues();
    const rows = values.slice(1); // drop header
    const entries = rows
      .filter(r => r[0]) // skip blank rows
      .map(r => {
        const obj = {};
        HEADERS.forEach((h, i) => obj[h] = r[i]);
        return obj;
      });
    return jsonOut_({ entries });
  }
  if (action === 'projects') {
    const sheet = getProjectsSheet_();
    const values = sheet.getDataRange().getValues();
    const rows = values.slice(1); // drop header
    const projects = {};
    rows
      .filter(r => r[0]) // skip blank rows
      .forEach(r => {
        const obj = {};
        PROJECT_HEADERS.forEach((h, i) => obj[h] = r[i]);
        const name = obj.name;
        delete obj.name;
        projects[name] = obj;
      });
    return jsonOut_({ projects });
  }
  return jsonOut_({ error: 'unknown action' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'append' && body.entry) {
      const sheet = getSheet_();
      const row = HEADERS.map(h => body.entry[h] !== undefined ? body.entry[h] : '');
      sheet.appendRow(row);
      return jsonOut_({ ok: true });
    }
    if (body.action === 'upsertProject' && body.name && body.project) {
      const sheet = getProjectsSheet_();
      const row = PROJECT_HEADERS.map(h =>
        h === 'name' ? body.name : (body.project[h] !== undefined ? body.project[h] : '')
      );
      const values = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === body.name) {
          rowIndex = i + 1; // 1-based, +1 for header
          break;
        }
      }
      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
      return jsonOut_({ ok: true });
    }
    return jsonOut_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
