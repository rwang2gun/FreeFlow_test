# FreeFlow 프로젝트 규칙

## 브랜치 규칙
- **항상 `main` 브랜치에서 작업하고 push한다.**

## 버전 관리 규칙 (필수)

### git push 전 반드시 수행
1. `FreeFlow_Test_split.html` 내 `const GAME_VERSION = 'X.XXX'` 값을 **0.001 증가**시킨다.
2. 버전 변경을 **별도 커밋** 또는 마지막 작업 커밋에 포함시킨다.
3. 작업 완료 메시지에 **현재 버전 번호**를 반드시 명시한다.

### 버전 위치
```
FreeFlow_Test_split.html
  → const GAME_VERSION = '0.XXX';  (line ~1011)
  (이 값이 JS로 game-version-display div에 주입됨 — static HTML 값은 무시)
```

### 예시
- push 전: `ver 0.034` → push 후: `ver 0.035`
- 작업 완료 시 사용자에게: "작업 완료. 현재 버전: **ver 0.035**"

### 버전 읽는 법
```bash
grep 'GAME_VERSION' FreeFlow_Test_split.html
```

## 대화 길이 경고 규칙

대화가 길어져 컨텍스트 한계에 근접하면 **사전에 경고**한다.

### 경고 기준 (대략적 판단)
- 대화 턴이 **15~20회** 이상 누적되거나
- 대용량 파일을 여러 번 읽어 컨텍스트가 많이 소모되었다고 느껴질 때

### 경고 방법
작업 완료 메시지 하단에 아래 문구를 추가한다:

> ⚠️ **대화가 길어지고 있습니다.** 중요한 설정(CLAUDE.md 업데이트 등)이 있다면 지금 새 대화 전에 처리하세요.

### 목적
`prompt too long` 오류로 대화가 강제 종료되기 전에 사용자가 CLAUDE.md 저장 등 중요한 작업을 마칠 수 있도록 한다.
