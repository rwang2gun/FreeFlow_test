const fs = require('fs');
const path = require('path');

// CSV 파일 읽기
const filePath = path.join(__dirname, 'ZZZ 스킬 db01.csv');
const raw = fs.readFileSync(filePath, 'utf-8');

// CSV 파싱 (따옴표 안 쉼표 처리)
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseRow(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx].trim() : '';
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function parseRow(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// 태그 분리: 쉼표(또는 /로 구분된 경우도 고려) 후 trim
function splitTags(str) {
  if (!str || !str.trim()) return [];
  return str.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

// 빈도 카운트
function countFreq(tags) {
  const freq = {};
  for (const tag of tags) {
    freq[tag] = (freq[tag] || 0) + 1;
  }
  return freq;
}

// 정렬된 빈도 배열
function sortedFreq(freq) {
  return Object.entries(freq).sort((a, b) => b[1] - a[1]);
}

// ─────────────────────────────────────────────
const { headers, rows } = parseCSV(raw);

console.log('='.repeat(70));
console.log('▶ CSV 컬럼 목록:', headers.join(' | '));
console.log('▶ 총 행 수 (헤더 제외):', rows.length);
console.log('='.repeat(70));

// ─────────────────────────────────────────────
// 1. 부가효과 분석
// ─────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('【1】 부가효과 - 고유 태그 목록 및 빈도');
console.log('='.repeat(70));

const allBunga = rows.flatMap(r => splitTags(r['부가효과']));
const bungaFreq = countFreq(allBunga);
const bungaSorted = sortedFreq(bungaFreq);

console.log(`\n총 등장 태그 수: ${allBunga.length}  /  고유 태그 수: ${bungaSorted.length}\n`);
console.log('[전체 고유 태그 목록 (알파벳/가나다 순)]');
const bungaUniq = [...Object.keys(bungaFreq)].sort((a, b) => a.localeCompare(b, 'ko'));
bungaUniq.forEach(t => console.log(`  "${t}" (${bungaFreq[t]}회)`));

// ─────────────────────────────────────────────
// 2. 유사 태그 그룹 분석
// ─────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('【2】 유사/중복 태그 그룹 분석');
console.log('='.repeat(70));

// 공백 제거 후 정규화하여 비교
function normalize(s) {
  return s.replace(/\s+/g, '').toLowerCase();
}

const normMap = {}; // normalized -> [original tags]
for (const tag of Object.keys(bungaFreq)) {
  const n = normalize(tag);
  if (!normMap[n]) normMap[n] = [];
  normMap[n].push(tag);
}

console.log('\n[공백 차이 등으로 의심되는 유사 태그]');
let hasSimilar = false;
for (const [norm, tags] of Object.entries(normMap)) {
  if (tags.length > 1) {
    hasSimilar = true;
    console.log(`  정규화: "${norm}"`);
    tags.forEach(t => console.log(`    → "${t}" (${bungaFreq[t]}회)`));
  }
}
if (!hasSimilar) console.log('  (공백 차이로 인한 중복 없음)');

// 키워드 포함 관계 기반 유사 그룹
console.log('\n[키워드 포함 기준 유사 그룹]');
const keywords = [
  'HP회복', 'HP', '무적', '피해증가', '강화', '충전', '방어', '속성',
  '슈퍼아머', '회피', '공격력', '에너지', '파티', '장전', '탄환',
  '속박', '기절', '화상', '감전', '냉기', '부식', '충격', '침묵'
];

for (const kw of keywords) {
  const matches = bungaUniq.filter(t => t.includes(kw));
  if (matches.length >= 2) {
    console.log(`  [${kw}] 포함 태그 (${matches.length}개):`);
    matches.forEach(t => console.log(`    "${t}" (${bungaFreq[t]}회)`));
  }
}

// ─────────────────────────────────────────────
// 3. 부가효과 Top 20
// ─────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('【3】 부가효과 - 가장 많이 등장하는 태그 Top 20');
console.log('='.repeat(70));
bungaSorted.slice(0, 20).forEach(([tag, cnt], i) => {
  console.log(`  ${String(i + 1).padStart(2)}위. "${tag}" - ${cnt}회`);
});

// ─────────────────────────────────────────────
// 4. 시너지 / 리액션 태그 분석
// ─────────────────────────────────────────────
for (const colName of ['시너지', '리액션 태그']) {
  console.log('\n' + '='.repeat(70));
  console.log(`【4】 ${colName} - 고유값 및 빈도`);
  console.log('='.repeat(70));

  const allTags = rows.flatMap(r => splitTags(r[colName]));
  const freq = countFreq(allTags);
  const sorted = sortedFreq(freq);

  if (sorted.length === 0) {
    console.log('  (데이터 없음)');
    continue;
  }

  console.log(`\n총 등장: ${allTags.length}회  /  고유 태그: ${sorted.length}개\n`);
  console.log('[전체 고유 태그 (빈도순)]');
  sorted.forEach(([tag, cnt], i) => {
    console.log(`  ${String(i + 1).padStart(3)}. "${tag}" - ${cnt}회`);
  });
}

// ─────────────────────────────────────────────
// 5. 전용 버프 고유값
// ─────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('【5】 전용 버프 - 고유값');
console.log('='.repeat(70));

const allBuff = rows.flatMap(r => splitTags(r['전용 버프']));
const buffFreq = countFreq(allBuff);
const buffSorted = sortedFreq(buffFreq);

if (buffSorted.length === 0) {
  console.log('  (데이터 없음)');
} else {
  console.log(`\n총 등장: ${allBuff.length}회  /  고유 값: ${buffSorted.length}개\n`);
  buffSorted.forEach(([tag, cnt], i) => {
    console.log(`  ${String(i + 1).padStart(3)}. "${tag}" - ${cnt}회`);
  });
}

// ─────────────────────────────────────────────
// 소모 자원 보너스 분석
// ─────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('【부록】 소모 자원 고유값');
console.log('='.repeat(70));
const allRes = rows.flatMap(r => splitTags(r['소모 자원']));
const resFreq = countFreq(allRes);
sortedFreq(resFreq).forEach(([tag, cnt]) => {
  console.log(`  "${tag}" - ${cnt}회`);
});

console.log('\n' + '='.repeat(70));
console.log('분석 완료.');
console.log('='.repeat(70));
