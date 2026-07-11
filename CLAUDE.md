# Claude Agent Guide

이 문서는 Claude 에이전트가 이 프로젝트에서 작업할 때 참고하는 지침입니다.

## 프로젝트 구조

- `src/content/` — 콘텐츠 소스 (Astro Content Collections)
  - `projects/` — 회사 경력·프로젝트 (zod 스키마: `src/content/config.ts`)
  - `sideProjects/` — 사이드 프로젝트 & 활동
  - `about/` — 히어로/소개 (이름, 타이틀, 링크, 소개 불릿)
  - `education/` — 학력
  - `certifications/` — 자격증
  - `skills/` — 기술 스택 (카테고리별)
  - 각 컬렉션은 `lang: 'ko' | 'en'` 필드로 언어를 구분하며, 같은 컬렉션 안에 ko/en 파일이 함께 존재
- `src/styles/tokens.css` — 색상/간격/폰트 CSS 변수 단일 소스
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

## 배포

GitHub Actions를 통해 자동 배포됩니다.
- main 브랜치에 push하면 자동으로 GitHub Pages에 배포
- URL: https://kybee.github.io (한국어), https://kybee.github.io/en/ (영어)

## 롤백

- `v1-linear` 태그가 리디자인 이전(Linear/Vercel 스타일) 배포 상태를 가리킨다. 문제가 생기면 이 태그로 되돌릴 수 있다.
