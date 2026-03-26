#!/usr/bin/env node
/**
 * ZZZ 나무위키 스크래퍼
 * 사용법: node scrape-wiki.js <에이전트 풀네임>
 * 예시:   node scrape-wiki.js 호시미 미야비
 *
 * 출력: output/<에이전트명>_wiki.json
 */

const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Accept-Encoding': 'identity',
};

const ATTR_MAP = {
  '서리': '얼음', '불꽃': '불', '전격': '전기', '물리': '물리', '에테르': '에테르',
};

// 섹션 번호 → 대분류/소분류 매핑 (ZZZ 스킬 구조 표준)
// 3.2.X.Y 에서 X = 대분류 그룹, Y = 세부 순서
const SECTION_MINOR_MAP = {
  '1.1': '기본공격',   '1.2': '차지공격',   '1.3': '강화차지공격',
  '2.1': '회피',       '2.2': '대시공격',    '2.3': '회피반격',
  '3.1': '빠른지원',   '3.2': '패링지원',    '3.3': '지원돌격',
  '4.1': '특수스킬',   '4.2': '강화특수스킬',
  '5.1': '콤보스킬',   '5.2': '궁극기',
  '6.1': '핵심패시브', '6.2': '추가능력',
};

const MINOR_TO_MAJOR = {
  '기본공격': '일반공격',     '차지공격': '일반공격',   '강화차지공격': '일반공격',
  '회피': '회피스킬',         '대시공격': '회피스킬',   '회피반격': '회피스킬',
  '빠른지원': '지원스킬',     '패링지원': '지원스킬',   '지원돌격': '지원스킬',
  '특수스킬': '특수스킬',     '강화특수스킬': '특수스킬',
  '콤보스킬': '콤보공격',
  '궁극기': '궁극기',
  '핵심패시브': '핵심스킬',   '추가능력': '핵심스킬',
};

// ─── 유틸 ────────────────────────────────────────────────
async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf);
}

function decodeEntities(html) {
  return html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#91;/g, '[').replace(/&#93;/g, ']');
}

function stripHtml(html) {
  return decodeEntities(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr)>/gi, '\n')
    .replace(/<\/td>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanSkillText(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !/^[\d.]+%/.test(l))                          // 배율 수치 줄
    .filter(l => !/^\d+$/.test(l))                             // 레벨 숫자 단독 줄
    .filter(l => !/^(레벨|피해 배율|그로기 배율|에너지 소모|추가 능력치|추가 능력)$/.test(l))
    .filter(l => !/^\[편집\]$/.test(l))
    .filter(l => !/^id=/.test(l))                              // HTML 속성 잔여물
    .filter(l => !/^data-v-/.test(l))                          // Vue 속성 잔여물
    .filter(l => !/\[편집\]$/.test(l))                         // "스킬이름[편집]" 헤더 줄
    .filter(l => !/^\d+\.\d+\.\d+/.test(l))                   // "3.2.X.X." 섹션 번호 줄
    .join('\n');
}

// ─── 에이전트 정보 추출 ──────────────────────────────────
function extractAgentInfo(html) {
  const fullName = html.match(/<title>([^<]+)<\/title>/)?.[1]
    ?.replace(' - 나무위키', '').trim() ?? '';
  const shortName = fullName.split(' ').pop();

  const ogDesc = html.match(/property="og:description" content="([^"]+)"/)?.[1] ?? '';
  const descMatch = ogDesc.match(/([^\s]+(?:\s[^\s]+)*) 진영의 (\S+) (\S+) 에이전트/);
  const faction = descMatch ? descMatch[1].split(' ').slice(-2).join(' ') : '';
  const attr = ATTR_MAP[descMatch?.[2]] ?? descMatch?.[2] ?? '';
  const cls = descMatch?.[3] ?? '';

  const nameIdx = html.indexOf(shortName, 100000);
  const beforeName = html.slice(100000, nameIdx > 0 ? nameIdx : 200000);
  const gradeMatches = [...beforeName.matchAll(/alt='젠레스 존 제로-등급-([SA])'/g)];
  const grade = gradeMatches[gradeMatches.length - 1]?.[1] ?? '?';

  const versionMatch = html.match(/(\d+\.\d+) 버전에서의 출시/);
  const version = versionMatch?.[1] ?? '';

  return { fullName, shortName, attr, cls, faction, grade, version };
}

// ─── 스킬 섹션 추출 ──────────────────────────────────────
function extractSkills(html) {
  // 핵심 패턴: id='분류: 스킬이름' data-v-XXXXXXXX
  // 개별 스킬 (콜론 포함)만 추출, 대분류 헤더(콜론 없음) 제외
  const SKILL_ID_RE = /id='([^']+:[^']+)'\s+data-v-[0-9a-f]+/g;

  const skillIds = [];
  let m;
  while ((m = SKILL_ID_RE.exec(html)) !== null) {
    // 본문 영역(1100000+)에서만
    if (m.index < 1100000) continue;
    skillIds.push({ id: m[1], pos: m.index });
  }

  if (skillIds.length === 0) return [];

  // 각 스킬의 설명 텍스트 추출
  const skills = [];
  for (let i = 0; i < skillIds.length; i++) {
    const { id, pos } = skillIds[i];
    const endPos = i < skillIds.length - 1 ? skillIds[i + 1].pos : pos + 15000;

    const chunk = html.slice(pos, Math.min(endPos, pos + 12000));
    const raw = stripHtml(chunk);
    const description = cleanSkillText(raw);

    // id 파싱: "일반 공격: 바람꽃" → minorLabel="일반 공격", skillName="바람꽃"
    const colonIdx = id.indexOf(':');
    const minorLabel = id.slice(0, colonIdx).trim();
    const skillName = id.slice(colonIdx + 1).trim();

    // 섹션 번호로 소분류 결정 (id 앞에서 section 번호 찾기)
    // 패턴: href='#s-3.2.X.Y' 또는 3.2.X.Y 숫자
    const sectionChunk = html.slice(Math.max(0, pos - 300), pos);
    const secMatch = sectionChunk.match(/3\.2\.(\d+)\.(\d+)/);
    let minor, major;
    if (secMatch) {
      const key = `${secMatch[1]}.${secMatch[2]}`;
      minor = SECTION_MINOR_MAP[key] ?? minorLabel.replace(/\s/g, '');
      major = MINOR_TO_MAJOR[minor] ?? minorLabel;
    } else {
      minor = minorLabel.replace(/\s/g, '');
      major = MINOR_TO_MAJOR[minor] ?? minorLabel;
    }

    skills.push({ major, minor, skillName, description: description.slice(0, 800) });
  }

  return skills;
}

// ─── 메인 ────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('사용법: node scrape-wiki.js <에이전트 풀네임>');
    console.error('예시:   node scrape-wiki.js 호시미 미야비');
    process.exit(1);
  }

  const agentName = args.join(' ');
  const url = `https://namu.wiki/w/${encodeURIComponent(agentName)}`;

  console.log(`\n📡 페이지 가져오는 중: ${url}`);
  const html = await fetchPage(url);
  console.log(`✅ 페이지 로드 완료 (${(html.length / 1024).toFixed(0)}KB)`);

  console.log('\n🔍 에이전트 정보 추출 중...');
  const agentInfo = extractAgentInfo(html);
  console.log(`   이름: ${agentInfo.fullName} (${agentInfo.shortName})`);
  console.log(`   속성: ${agentInfo.attr} | 클래스: ${agentInfo.cls} | 등급: ${agentInfo.grade}등급`);
  console.log(`   진영: ${agentInfo.faction} | 버전: v${agentInfo.version}`);

  console.log('\n📋 스킬 섹션 추출 중...');
  const skills = extractSkills(html);
  console.log(`   총 ${skills.length}개 스킬 발견`);
  skills.forEach(s => console.log(`   - [${s.minor}] ${s.skillName}`));

  const output = {
    agent: agentInfo,
    skills: skills.map(s => ({
      name: `${s.minor}: ${s.skillName}`,
      major: s.major,
      minor: s.minor,
      description: s.description,
    })),
    extractedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${agentInfo.shortName}_wiki.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n💾 저장 완료: ${outFile}`);
  console.log('다음 단계: 이 JSON을 Claude에게 전달 → zzz-skill-tagger로 태깅');
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
