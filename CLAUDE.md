# Claude Agent Guide

이 문서는 Claude 에이전트가 이 프로젝트에서 작업할 때 참고하는 지침입니다.

## 프로젝트 구조

- `content.md` — 한국어 콘텐츠 소스
- `content.en.md` — 영어 콘텐츠 소스
- `src/pages/index.astro` — 한국어 페이지 (/)
- `src/pages/en/index.astro` — 영어 페이지 (/en/)
- `src/layouts/Layout.astro` — 공용 레이아웃

## 중요 규칙

### 콘텐츠 쌍방 반영 (필수)

**content.md 또는 content.en.md를 수정할 때는 반드시 두 파일 모두에 변경 사항을 반영해야 합니다.**

- 한국어 파일 수정 시 → 영어 파일도 동일하게 수정
- 영어 파일 수정 시 → 한국어 파일도 동일하게 수정

이는 Astro 페이지(index.astro, en/index.astro)에도 동일하게 적용됩니다.

### 디자인 제약 (변경 금지)

1. 원페이지 (섹션 앵커 네비게이션만)
2. 다크모드 토글 없음, 애니메이션 없음
3. 폰트: Pretendard 1개
4. 색상: 배경(#ffffff) + 텍스트(#1a1a1a) + 포인트(#2563eb), 총 3색

### 하지 말 것

- 블로그 기능 추가
- JS 기반 i18n 라이브러리 추가
- 컴포넌트 라이브러리 추가
- 임의 디자인 개선

## 배포

GitHub Actions를 통해 자동 배포됩니다.
- main 브랜치에 push하면 자동으로 GitHub Pages에 배포
- URL: https://kybee.github.io (한국어), https://kybee.github.io/en/ (영어)
