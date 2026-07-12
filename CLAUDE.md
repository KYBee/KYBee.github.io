# Claude Agent Guide

이 문서는 Claude 에이전트가 이 프로젝트에서 작업할 때 참고하는 지침입니다.

## 프로젝트 구조

- `src/content/` — 콘텐츠 소스 (Astro Content Collections)
  - `projects/` — 회사 경력·프로젝트 상세 (zod 스키마: `src/content/config.ts`). 같은 회사·역할·기간 항목이 연속하면
    하나의 그룹으로 묶이며, `# 경력`에는 그룹(회사) 단위 요약만, `# 업무-프로젝트`에는 첫 번째 그룹(현재 재직 중인 회사)의
    개별 항목이 상세 카드로 렌더링된다 — 자세한 렌더링 규칙은 아래 "워크스페이스 채널 구조 & 콘텐츠 컨벤션" 참고
  - `sideProjects/` — 사이드 프로젝트 & 활동 (`# 사이드-프로젝트` 채널)
  - `about/` — 프로필 패널·채널 인트로에 쓰이는 개인 정보 전체 (이름, 타이틀, 상태 문구, 소속, 하는 일, 관심사, 강점,
    출몰지역, 링크, 소개 불릿 등). 필드 목록은 `src/content/config.ts`의 `about` 스키마가 최종 소스
  - `education/` — 학력
  - `certifications/` — 자격증
  - `skills/` — 기술 스택 (카테고리별)
  - 각 컬렉션은 `lang: 'ko' | 'en'` 필드로 언어를 구분하며, 같은 컬렉션 안에 ko/en 파일이 함께 존재
- `src/styles/tokens.css` — 색상/간격/폰트 CSS 변수 단일 소스
- `src/components/Workspace.astro` — 전체 워크스페이스 UI(사이드바/채널/메시지/프로필 패널)를 담는 단일 컴포넌트.
  `lang` prop으로 ko/en 콘텐츠를 동일한 마크업에 렌더링한다
- `src/components/Avatar.astro` — 아바타 렌더링 전담 컴포넌트 (이미지/이니셜 폴백, 아래 "아바타" 절 참고)
- `src/pages/index.astro` — 한국어 페이지 (/)
- `src/pages/en/index.astro` — 영어 페이지 (/en/)
- `src/layouts/Layout.astro` — 공용 레이아웃 (사이드바/톱바 포함)

## 중요 규칙

### 콘텐츠 수정은 src/content/ 로만 (필수)

**콘텐츠 추가/수정은 반드시 `src/content/` 아래 해당 컬렉션 파일로만 한다.**

- `src/content/config.ts`의 zod 스키마를 벗어나는 필드/타입은 빌드가 실패한다 (의도된 동작)
- ko 콘텐츠를 추가/수정하면 같은 컬렉션에 대응하는 en 파일도 함께 추가/수정한다 (그 반대도 동일)
- `content.md` / `content.en.md` 같은 별도 마크다운 콘텐츠 소스는 더 이상 사용하지 않는다

### 수정 범위 제한

- `src/components/`, `src/layouts/`, `src/styles/tokens.css`는 **사용자가 명시적으로 요청할 때만** 수정한다
- 색상 변경은 반드시 `tokens.css`의 CSS 변수를 통해서만 한다 (컴포넌트에 색상 하드코딩 금지)

### 커밋 전 필수

- **커밋 전 `npm run build`가 반드시 통과해야 한다**

### 금지 사항

- Slack 로고/상표 사용 (워크스페이스 UI 컨셉만 차용, "Slack"이라는 단어와 로고는 사이트 어디에도 쓰지 않는다)
- 회사 내부 시스템명 노출
- 개인 식별정보 노출
- 이직 관련 내용 노출
- 블로그 기능 추가
- JS 기반 i18n 라이브러리 추가
- 컴포넌트 라이브러리 추가
- 임의 디자인 개선

## 워크스페이스 채널 구조 & 콘텐츠 컨벤션

`Workspace.astro`가 렌더링하는 사이드바 채널과 메시지는 아래 규격을 따른다. 새 콘텐츠를 추가할 때 이 구조를 벗어나지 않는다.

### 채널 목록 (사이드바 순서)

| 채널 | 소스 | 내용 |
|---|---|---|
| `# 경력` | `projects/` (그룹 단위) | 회사 나열만. 회사별로 job-divider(회사·역할·기간·근무지) + 한 줄 소개 메시지 1개. 프로젝트 상세/성과 수치는 넣지 않는다 |
| `# 업무-프로젝트` | `projects/` 중 첫 번째 그룹(현재 재직 중인 회사)의 개별 항목 | 프로젝트 상세 카드. 타임스탬프 자리에 `{회사} · {기간}` 표기 |
| `# 사이드-프로젝트` | `sideProjects/` | 사이드 프로젝트 카드 목록 + 활동 한 줄(`about.activities`) |
| `# 기술` | `skills/` | 카테고리별 기술 태그 |
| `# 학력-자격` | `education/`, `certifications/` | 학력 상세 + 자격증/어학 목록 |

- `# 경력`이 랜딩 뷰(첫 채널)다. 개인 소개 블록(channel-intro)은 **채널 섹션 밖, 메인 콘텐츠 최상단**에 독립적으로
  위치하며 (`<section id="experience">`에 속하지 않음) 그 아래로 `# 경력` 채널 헤더(구분선/제목)가 이어진다
- 채널 목록(사이드바)에는 프로필로 이동하는 링크가 없다. 프로필 패널은 사이드바 "다이렉트 메시지" 아래 DM 항목
  (`[data-open-profile]`)을 클릭해야만 열리며, 채널이 아니므로 `channelOrder`에 추가하지 않는다
- 인턴/이전 회사(신영증권, 마인즈랩 등 `projects/`의 나머지 그룹)는 `# 경력`에만 한 줄 요약으로 남고 `# 업무-프로젝트`에는
  올라가지 않는다 (현재 재직 중인 회사, 즉 첫 번째 그룹만 상세 채널로 분리)

### 메시지 카드 규격

각 프로젝트/경력 메시지는 아래 요소로 구성된다 (없는 필드는 생략):

```
[아바타] 이름  소속·기간(또는 기간만)
         제목 (message-title)
         본문 요약 또는 불릿 (message-summary / message-bullets)
         인용구 — 성과 수치 (quote-block, item.metric)
         리액션 pill + 기술 태그 (reactions / reaction-pill / tag-pill)
```

- `# 업무-프로젝트`에서는 message-time 자리에 `{item.company} · {item.period}` (예: "삼성전자 · 2023.09 – 현재")를
  쓴다 — 채널만 봐도 어느 회사 소속 업무인지 알 수 있게 하기 위함
- 카드 디자인·리액션 이모지·태그 스타일은 변경하지 않고 그대로 재사용한다

**`# 경력`·`# 기술`은 예외**: 회사/항목마다 아바타·이름을 반복해서 게시글로 나누지 않는다. 채널 전체가
아바타 + 이름(`message-meta`) **한 번**만 나오는 메시지 하나로 감싸이고, 그 안에서 각 회사(또는 카테고리)는
아바타/이름/타임스탬프 없이 구분선 + 본문만 나열된다:

```
[아바타] 이름                         ← message 하나, 한 번만
         회사 — 역할 · 기간 · 근무지    ← job-divider (.job-group으로 묶음)
         한 줄 요약
         ────────────                 ← 단순 hr (.job-hr), 얇고 subtle한 구분선만
         회사 — 역할 · 기간 · 근무지
         한 줄 요약 + 기술 태그
```

- `# 경력` 채널의 회사 항목 구분은 **심플한 `<hr class="job-hr">`만 사용**한다. 날짜 뱃지 + 가로선으로 된
  Slack date divider(`.timeline-divider`/`.timeline-pill`)는 이 채널에 쓰지 않는다 — 날짜/기간 정보는 이미
  job-divider 텍스트 안에 있어 별도 표시가 중복이며 시각적으로 과하다
- `# 경력`의 회사 요약은 job-divider에 회사·역할·기간·근무지가 이미 들어있으므로 별도 message-time을 쓰지 않는다.
  재직 중인 회사(`gi === 0`)는 `about.work` 한 줄, 나머지는 `item.summary` + 태그를 사용한다
- `# 기술`도 동일 패턴(아바타+이름 한 번 + `skill-group` 목록)이며, 새 채널에서 "항목별로 게시글을 분리할지 vs
  하나의 메시지 안에 목록으로 나열할지" 판단이 필요하면 이 두 채널을 기준으로 삼는다 — 같은 화자가 여러 항목을
  나열하는 경우(경력, 기술처럼 "내 이력의 한 부분") 후자를, 각 항목이 독립적인 게시물 성격(업무-프로젝트,
  사이드-프로젝트처럼 "각각이 하나의 작업물")이면 전자를 쓴다

### 레이아웃

- 메인 콘텐츠(`.channel` 내부 요소)는 사이드바 옆에 **좌측 정렬**한다. `.message`, `.channel-header`,
  `.channel-intro`, `.job-divider` 등에 `margin-left/right: auto`로 가운데 정렬을 걸지 않는다
- 가독성용 `max-width`(`--content-max-width`, 현재 800px)는 메시지 본문/헤더 등 **개별 요소에만** 적용한다.
  `.content`나 `.channel` 같은 컨테이너 자체에 max-width를 걸지 않는다

### 프로필 카드 배열 (channel-intro, 프로필 패널)

channel-intro 블록은 채널 섹션 밖, 메인 콘텐츠 최상단(모든 채널보다 위)에 독립적으로 위치한다. 내부 순서는
다음과 같다:

1. 아바타
2. 이름 / 직함 (`about.name` / `about.title`)
3. 상태 — 초록 점 + `about.activityStatus` (예: "실시간 접속 중" / "Online now")
4. 링크 버튼 — GitHub · Blog · LinkedIn · Email, 테두리 있는 pill/button 스타일 (아이콘 + 라벨, 가로 나열)
5. 소개 불릿 3개 (`about.bullets`)

프로필 패널(사이드바 "김영빈 (나)" 클릭 시 열리는 우측 드로어)은 별도 레이아웃(Slack 멤버 프로필 스타일: 아바타 →
이름/상태 → 연락처 정보 → 내 소개 필드 리스트)을 쓰며 channel-intro와 순서가 다르다 — 용도(채널 첫인상 vs 상세
프로필 조회)가 달라 통일하지 않는다.

### 아바타

- `src/components/Avatar.astro`가 아바타 렌더링을 전담한다. `public/profile.png` / `.jpg` / `.jpeg` / `.webp` 중
  하나가 존재하면 그 이미지를 쓰고, 없으면 이니셜(`YB`) 폴백으로 렌더링한다 — **파일만 추가하면 자동으로 이미지로
  전환**된다 (컴포넌트/컨텐츠 수정 불필요)
- 이미지 교체 시 `public/profile.*`에 파일 하나만 두면 되고, ko/en 페이지에 각각 넣을 필요 없다 (컴포넌트가 공유)
- 아바타가 쓰이는 모든 위치(메시지 아바타, channel-intro, 프로필 패널, 사이드바/드로어 DM 항목)가 이 컴포넌트를
  통해 렌더링되므로, 아바타 관련 변경은 `Avatar.astro`만 고치면 전체에 반영된다
- 사이드바/드로어 DM 항목의 아바타는 우측 하단에 초록 상태점이 오버레이된다 (`.dm-avatar` 래퍼)

### 신규 콘텐츠 추가 예시

- **현재 재직 중인 회사에 새 프로젝트 추가** → `src/content/projects/`에 ko/en 파일 쌍 추가, `company`/`role`/
  `period`를 기존 재직 중 그룹과 동일하게 맞추면 자동으로 `# 업무-프로젝트`에 상세 카드로 들어가고, `# 경력`은
  회사 요약 메시지 그대로 유지된다 (요약은 `about.work`를 쓰므로 프로젝트 추가만으로는 `# 경력` 문구를 따로
  손댈 필요 없다)
- **이직/새 회사 추가** → `src/content/projects/`에 새 회사의 `company`/`role`/`period`로 ko/en 파일 쌍 추가.
  `order`를 기존 항목보다 낮게 주면(컨벤션: 최신순으로 오름차순, 가장 최근이 가장 작은 값) 새 회사가
  `projectGroups[0]`이 되어 자동으로 `# 업무-프로젝트`의 대상 회사로 바뀐다. 기존 최신 회사는 `# 경력`의
  일반 그룹(한 줄 요약)으로 내려간다
- **사이드 프로젝트 추가** → `src/content/sideProjects/`에 ko/en 파일 쌍 추가, `order`로 정렬 순서 지정
- **자격증/학력 추가** → `src/content/certifications/` 또는 `src/content/education/`에 ko/en 파일 쌍 추가
- 모든 경우 **ko 파일과 en 파일을 항상 함께** 추가/수정한다 (하나만 추가하면 언어별 페이지가 어긋난다)

### KO/EN 동기화 규칙

- `src/content/` 아래 모든 컬렉션은 ko/en 파일을 쌍으로 유지한다 — 위 "콘텐츠 수정은 src/content/ 로만" 규칙과 동일
- `about.yaml`의 `status`(프로필 패널 상태 문구), `activityStatus`(channel-intro 상태 문구), `affiliation`/`work`/
  `interests`/`strengths`/`whereabouts`(프로필 패널 "내 소개" 필드) 등은 ko/en 각각 자연스러운 한 줄로 번역하되
  캐주얼한 톤을 유지한다
- `public/profile.*` 이미지는 언어에 관계없이 하나만 두면 양쪽 페이지에 공용으로 쓰인다
- `Workspace.astro`의 `copy` 객체(ko/en 텍스트)에 새 채널이나 라벨을 추가할 때는 반드시 `ko`/`en` 양쪽 키를
  함께 추가한다

## 배포

GitHub Actions를 통해 자동 배포됩니다.
- main 브랜치에 push하면 자동으로 GitHub Pages에 배포
- URL: https://kybee.github.io (한국어), https://kybee.github.io/en/ (영어)

## 롤백

- `v1-linear` 태그가 리디자인 이전(Linear/Vercel 스타일) 배포 상태를 가리킨다. 문제가 생기면 이 태그로 되돌릴 수 있다.
