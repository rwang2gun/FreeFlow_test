# FreeFlow 프로젝트 규칙

## 브랜치 규칙
- **항상 `main` 브랜치에서 작업하고 push한다.**

---

## 버전 관리 규칙 (필수)

### git push 전 반드시 수행
1. `FreeFlow_Test_split.html` 내 `const GAME_VERSION = 'X.XXX'` 값을 **0.001 증가**시킨다.
2. 버전 변경을 마지막 작업 커밋에 포함시킨다.
3. 작업 완료 메시지에 **현재 버전 번호**를 반드시 명시한다.

### 버전 위치
```
const GAME_VERSION = '0.0XX';   // grep 'GAME_VERSION' 으로 위치 확인
document.getElementById('game-version-display').textContent = 'ver ' + GAME_VERSION;
```
> static HTML의 `game-version-display` div 텍스트는 JS가 덮어씀 → JS 상수만 수정할 것

### 버전 읽는 법
```bash
grep 'GAME_VERSION' FreeFlow_Test_split.html
```

---

## 대화 길이 경고 규칙
- 대화 턴이 **15~20회** 이상 누적되거나 대용량 파일을 반복 읽었을 때  
- 작업 완료 메시지 하단에 추가:  
  > ⚠️ **대화가 길어지고 있습니다.** CLAUDE.md 업데이트 등 중요한 작업이 있다면 새 대화 전에 처리하세요.

---

## 파일 구조

단일 HTML 파일 (`FreeFlow_Test_split.html`)에 CSS + JS 전부 포함.  
> 라인 번호는 편집 시 변동되므로 **클래스명/상수명으로 grep해서 찾을 것.**

| 섹션 | 찾는 법 (`grep`) | 내용 |
|------|-----------------|------|
| HTML/CSS | `<style>` | 반응형 UI, 오버레이 |
| InputManager | `class InputManager` | 키보드·마우스 입력 |
| CameraRig / StateMachine | `class CameraRig` | 카메라, FSM 베이스 |
| State 서브클래스 | `class HurtState` | 10종 상태 클래스 |
| POSES 딕셔너리 | `const POSES` | 포즈 데이터 전체 |
| CharacterFS | `class CharacterFS` | 검사 (기본 캐릭터) |
| CharacterEF | `class CharacterEF` | 격투가 |
| CharacterWM | `class CharacterWM` | 완드 마법사 |
| Goblin | `class Goblin` | 근접 적 |
| VFX 클래스들 | `class FloatingIndicator` | 이펙트, 투사체 |
| GoblinSpearman | `class GoblinSpearman` | 원거리 적 |
| Game | `class Game` | 메인 루프, 씬, UI |
| PoseEditor 연동 | `BUILTIN_POSE_KEYS` | 커스텀 포즈 로드 |

---

## 클래스 구조

### 캐릭터 상속
```
CharacterFS (검사, 기본)
  ├── CharacterEF (격투가) — 콤보·차지 오버라이드
  └── CharacterWM (완드 마법사) — 스킬·투사체 오버라이드
```

### 공통 주요 메서드
| 메서드 | 설명 |
|--------|------|
| `applyPose(pose, speed, dt)` | POSES 데이터를 lerp로 적용 |
| `updateCombo(dt, state)` | 콤보 단계별 실행 |
| `updateChargeWindup(dt, state)` | 강공격 차징 |
| `executeSkill(dt, state)` | 스킬 동작 |
| `executeUltimate(dt, state)` | 궁극기 동작 |
| `takeDamage(kbDir, kbSpeed)` | 피격 처리 |
| `_acquireTarget()` | 가장 가까운 적 잠금 |
| `calculateMovement(dt)` | 카메라 기준 이동 벡터 |

### State 클래스 (10종)
| 클래스 | name | 역할 |
|--------|------|------|
| `HurtState` | 'hurt' | 피격·넉백 (0.6s) |
| `IdleState` | 'idle' | 대기, 행동 트리거 |
| `WalkState` | 'walk' | 이동 |
| `DashState` | 'dash' | 회피 (0.25s, 8m/s) |
| `AttackState` | 'attack' | 콤보 |
| `SkillState` | 'skill' | 스킬 (쿨다운 8s) |
| `UltimateState` | 'ultimate' | 궁극기 (MP 풀 필요) |
| `ChargeAttackState` | 'chargeAttack' | 강공격 (홀드 0.3s) |
| `SwapOutState` | 'swapOut' | 캐릭터 교체 퇴장 |
| `SwapInState` | 'swapIn' | 캐릭터 교체 등장 |

---

## 포즈(POSES) 시스템

### 데이터 구조
```javascript
POSES.pose_name = {
    root:  { y, rx, ry },              // 높이, 피치, 요
    waist: { rx, ry },
    chest: { rx, ry },
    rArm:  { sx, sy, sz, ex, wx, wy }, // 어깨(s), 팔꿈치(e), 손목(w)
    lArm:  { sx, sy, sz, ex, wx, wy },
    rHip:  { rx, ry, rz, knee },
    lHip:  { rx, ry, rz, knee },
}
```

### 포즈 적용
```javascript
this.applyPose(POSES.wm_skill, 12, dt);
// speed: 6~12=느린 전환, 20~28=콤보, 30~40=빠른 복귀
```
- 모든 관절을 매 프레임 lerp로 부드럽게 전환
- `alpha = Math.min(1, speed * dt)`

### 포즈 명명 규칙
- 공용: `idle`, `battle_idle`, `hurt`, `dash`, `combo1~4` 등
- 캐릭터 전용: `fs_*`, `ef_*`, `wm_*` 접두사
- 카테고리: `*_skill`, `*_ult_*`, `*_charge_*`

### 포즈 추가 시 주의
- `POSES` 딕셔너리 위치: `grep 'const POSES'`
- PoseEditor(`localStorage`)에서 커스텀 포즈 자동 로드 — 기본 포즈는 덮어쓰지 않음 (`grep 'BUILTIN_POSE_KEYS'`)
- 중복 포즈 금지: 같은 값의 포즈를 다른 이름으로 두지 말 것 (독립 편집이 필요할 경우 값을 차별화)

---

## 입력 시스템

### 키 바인딩
| 키 | 액션 |
|----|------|
| W/A/S/D | 이동 |
| Shift | 대시 |
| E | 스킬 |
| Q | 궁극기 |
| 클릭 (탭) | 일반 공격 |
| 클릭 (홀드 0.3s) | 강공격 |
| Tab / 1·2·3 | 캐릭터 전환 |
| Esc | 일시정지 |
| `,` | 좌클릭 시뮬레이션 (키보드 공격) |
| `.` | 우클릭 시뮬레이션 (키보드 대시) |

### 트리거 방식
- `attackTriggered`, `skillTriggered`, `ultimateTriggered` 등은 **단일 프레임 소비형**
- 매 프레임 끝 트리거 리셋 (`grep 'attackTriggered = false'` 로 위치 확인)
- State에서 소비 후 다시 활성화되지 않음

---

## 게임 루프 (Game.animate)

```
requestAnimationFrame
  → dt 계산 (최대 0.03s 캡)
  → 카운트다운 처리
  → AI 업데이트 (updateAI)
  → 투사체 업데이트 (spears, magicBolts)
  → VFX 업데이트 (indicators, rings, fire blades)
  → 캐릭터 업데이트 (charDt = 0.5× slow-mo 적용 가능)
  → 적 업데이트 (enemyDt = 0.1× slow-mo 적용 가능)
  → CameraRig 업데이트
  → UI 배지 갱신
  → renderer.render()
  → 트리거 리셋
```

### 슬로우모션
- `charDt`, `enemyDt`를 독립 조절 → 캐릭터/적 각각 별도 시간 흐름
- `charSlowTimer`, `enemySlowTimer`로 지속 시간 관리

---

## UI 주요 ID

| ID | 용도 |
|----|------|
| `game-canvas` | Three.js WebGL 렌더 타겟 |
| `game-version-display` | 버전 표시 (JS가 덮어씀) |
| `stance-badge` | 전투 모드 배지 |
| `hp-badge` | 히트 카운트 |
| `score-badge` | 점수 |
| `skill-badge` | 스킬 쿨다운 |
| `mp-fill-FS/EF/WM` | 마나바 채움 너비 |
| `ult-ready-badge` | 궁극기 준비 표시 |
| `countdown-overlay` / `countdown-text` | 3·2·1 카운트다운 |
| `gameover-overlay` | 게임오버 화면 |
| `slowmo-overlay` | 슬로우모션 어둠 효과 |
| `pe-panel` / `pe-pose-list` | PoseEditor 패널 |

---

## 적(Enemy) 구조

| 클래스 | 역할 | role 값 |
|--------|------|---------|
| `Goblin` | 근접 기본 적 (×3) | `'attacker'` / `'watcher'` |
| `GoblinSpearman` | 원거리 투사체 (×1) | `'attacker'` / `'watcher'` |

- AI 조율: 동시 공격자 1명 제한, 0.5s 쿨다운 (`grep 'aiCoordinatorTimer'`)
- 범위: 공격 4m, 감지 8m

---

## 신규 작업 시 체크리스트

1. **포즈 추가**: `POSES` 딕셔너리에 추가 → 기존 포즈와 값 중복 여부 확인
2. **캐릭터 기능 추가**: 해당 Character 클래스 메서드 오버라이드 또는 추가
3. **State 추가**: `State` 베이스 상속 → `enter/update/exit` 구현 → StateMachine에 등록
4. **UI 추가**: HTML에 요소 추가 → `Game` 클래스의 updateUI 연결
5. **버전 업**: `GAME_VERSION` +0.001 후 push
