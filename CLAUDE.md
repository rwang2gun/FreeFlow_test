# FreeFlow 프로젝트 규칙

## 버전 관리 규칙 (필수)

### git push 전 반드시 수행
1. `FreeFlow_Test_split.html` 내 `<div id="version-badge">ver X.XXX</div>` 의 버전 숫자를 **0.001 증가**시킨다.
2. 버전 변경을 **별도 커밋** 또는 마지막 작업 커밋에 포함시킨다.
3. 작업 완료 메시지에 **현재 버전 번호**를 반드시 명시한다.

### 버전 위치
```
FreeFlow_Test_split.html
  → 가이드 메뉴 내 버전 텍스트: <div style="...">ver X.XXX</div>
  (게임 가이드 UI 하단, 버튼 그룹 바로 위)
```

### 예시
- push 전: `ver 0.001` → push 후: `ver 0.002`
- 작업 완료 시 사용자에게: "작업 완료. 현재 버전: **ver 0.002**"

### 버전 읽는 법
```bash
grep 'version-badge' FreeFlow_Test_split.html
```
