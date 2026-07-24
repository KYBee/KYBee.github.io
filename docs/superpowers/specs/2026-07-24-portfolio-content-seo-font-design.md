# 포트폴리오 콘텐츠 관리·SEO·폰트 최적화 설계

## 1. 배경과 결정

현재 포트폴리오는 Astro Content Collections의 YAML 파일을 읽어 GitHub Pages에 정적으로 배포한다. 콘텐츠는 GitHub에 안전하게 남지만, 항목을 추가·수정·삭제하려면 저장소 파일을 직접 편집해야 한다.

관리 방식은 다음과 같이 결정한다.

- 호스팅형 [Pages CMS](https://pagescms.org/)를 사용한다.
- 관리자는 자신의 GitHub 계정으로 Pages CMS에 로그인한다.
- Pages CMS는 이 저장소의 YAML 파일을 직접 읽고 저장한다.
- 저장은 편집 브랜치에 하고, 검증된 pull request만 `main`에 병합해 기존 GitHub Actions로 배포한다.
- 별도 `/admin` 페이지, 인증 서버, CMS 데이터베이스는 만들지 않는다.
- GitHub App은 `KYBee.github.io` 저장소 하나에만 설치하는 것을 운영 원칙으로 한다.

이 결정은 명령어 없이 브라우저에서 관리할 수 있고, 현재 GitHub 중심 구조를 바꾸지 않으며, 자체 인증 서버를 운영하지 않아도 된다는 점을 우선한 결과다.

## 2. 목표

### 콘텐츠 관리

- 브라우저 폼에서 현재 6개 콘텐츠 컬렉션을 관리한다.
- 단일 항목인 프로필은 한국어와 영어를 각각 수정할 수 있다.
- 프로필과 학력은 안전하게 수정하고, 경력 프로젝트, 사이드 프로젝트, 기술, 자격증은 추가·수정·삭제할 수 있다.
- 기존 YAML 필드와 Astro 스키마를 그대로 유지한다.
- 한국어와 영어 파일이 어긋난 상태는 배포 전에 탐지한다.
- CMS가 저장한 변경은 어떤 GitHub 인증 주체가 어떤 파일을 바꿨는지 Git 기록으로 남는다.

### SEO

- 한국어 `/`와 영어 `/en/`에 각각 올바른 description과 canonical URL을 제공한다.
- 두 언어 페이지가 서로의 번역본임을 `hreflang`으로 표시한다.
- Open Graph와 Twitter 기본 메타데이터를 제공한다.
- sitemap, robots.txt, favicon을 제공한다.
- 공개된 프로필 정보만 사용해 `ProfilePage`와 `Person` 구조화 데이터를 제공한다.

### 폰트

- 현재 여러 정적 Pretendard 파일을 내려받는 구조를 제거한다.
- 버전이 고정된 Pretendard Variable 동적 서브셋을 사용한다.
- 현재 디자인의 글꼴 인상은 유지하면서 첫 방문 전송량을 줄인다.

## 3. 범위에서 제외하는 것

- 자체 호스팅 CMS 및 `kybee.github.io/admin`
- CMS 사용자 초대나 다중 편집자 권한 체계
- 자동 번역과 번역 API
- 블로그 기능
- 콘텐츠 내용 자체의 재작성
- 컴포넌트 구조 개편이나 임의의 시각 디자인 변경
- 현재 사용자 작업이 있는 `src/components/Workspace.astro`의 구조 변경
- 프로필 이미지 업로드 관리

## 4. 전체 구조

```text
GitHub 계정
   ↓ 로그인
Pages CMS (app.pagescms.org)
   ↓ main에서 content/<작업명> 브랜치 생성
   ↓ .pages.yml에 정의된 폼
src/content/**/*.yaml
   ↓ 편집 브랜치에 GitHub 커밋
Pages CMS의 '게시 요청'
   ↓ pull request 자동 생성
콘텐츠 검증 + Astro 빌드 + 출력 검사
   ↓ 검사 성공 후 GitHub에서 병합
main
   ↓ 성공한 경우만
GitHub Pages 배포
```

Pages CMS는 편집 화면만 제공한다. 콘텐츠의 원본은 계속 `src/content/`이고, 사이트 생성기와 배포 방식도 계속 Astro와 GitHub Actions다.

## 5. Pages CMS 설계

### 5.1 저장소 설정

저장소 루트에 `.pages.yml`을 추가한다. 설정은 다음 원칙을 따른다.

- `format: yaml`을 명시한다.
- `settings.content.merge: false`를 사용해 선택 필드를 비웠을 때 기존 값이 되살아나지 않게 한다.
- `.pages.yml`의 필드 정의가 Astro 스키마와 일치하는지는 자동 테스트로 보호한다.
- 별도 이메일을 파일이나 설정에 넣지 않고 GitHub가 인증 주체의 커밋 귀속을 처리하게 한다.
- 커밋 메시지는 생성, 수정, 삭제를 구분하고 대상 경로를 포함한다.
- 컬렉션 목록에는 대표 필드, 언어, 정렬 순서를 함께 표시한다.
- `lang`은 `ko` 또는 `en`만 선택할 수 있다.
- 숫자 정렬 필드는 number 입력으로 제공한다.
- 배열은 반복 입력 UI로 제공한다.
- URL과 이메일은 기존 Astro 스키마와 같은 필수 여부를 유지한다.
- 저장소 메뉴에 `콘텐츠 검사` 액션을 제공해 현재 브랜치의 검증 workflow를 Pages CMS에서 실행할 수 있게 한다.
- 저장소 메뉴에 `게시 요청` 액션을 제공해 현재 편집 브랜치에서 `main`으로 향하는 pull request를 만들 수 있게 한다.

### 5.2 관리 메뉴

| 관리 메뉴 | 저장 위치 | CMS 동작 |
|---|---|---|
| 프로필 — 한국어 | `src/content/about/ko.yaml` | 수정만 허용 |
| 프로필 — 영어 | `src/content/about/en.yaml` | 수정만 허용 |
| 경력·업무 프로젝트 | `src/content/projects/` | 추가·수정·삭제 |
| 사이드 프로젝트 | `src/content/sideProjects/` | 추가·수정·삭제 |
| 기술 | `src/content/skills/` | 추가·수정·삭제 |
| 학력 | `src/content/education/` | 수정만 허용 |
| 자격증 | `src/content/certifications/` | 추가·수정·삭제 |

프로필은 사이트에 반드시 하나씩 있어야 하고, 현재 학력 화면도 언어별 첫 항목 하나만 사용하므로 두 컬렉션에서는 생성과 삭제를 막는다. 그 외 컬렉션은 요청대로 전체 CRUD를 허용한다. 파일 이름 변경은 번역 파일의 연결을 끊을 수 있으므로 모든 컬렉션에서 막는다.

### 5.3 편집 브랜치

콘텐츠는 `main`에서 바로 편집하지 않는다.

1. Pages CMS의 브랜치 메뉴에서 현재 `main`을 기준으로 `content/<작업명>` 브랜치를 만든다.
2. 생성한 브랜치로 이동해 필요한 파일을 모두 저장한다.
3. `콘텐츠 검사`로 현재 브랜치를 확인할 수 있다.
4. 작업이 끝나면 `게시 요청`을 눌러 pull request를 만든다.
5. GitHub에서 필수 검사가 성공한 것을 확인하고 병합한다.

예를 들어 `content/add-new-project`처럼 영문 소문자, 숫자, 하이픈으로 작업명을 만든다. 같은 작업을 이어갈 때는 기존 편집 브랜치를 다시 열 수 있다. 병합이 끝난 브랜치는 삭제하고 다음 작업은 최신 `main`에서 새로 만든다.

`main`에는 pull request와 필수 `content-check` 검사를 요구하고 관리자 우회를 허용하지 않는 branch ruleset을 적용한다. 따라서 관리자가 실수로 Pages CMS에서 `main`을 열어도 직접 저장은 거부된다.

### 5.4 새 항목의 파일 이름

현재 파일 구조는 같은 항목을 `<식별자>.ko.yaml`과 `<식별자>.en.yaml` 두 파일로 저장한다. 이 구조를 유지한다.

새 항목을 추가할 때는 다음 순서로 저장한다.

1. CMS의 생성 전용 파일 이름 입력에 `<식별자>.ko.yaml`을 넣어 한국어 YAML을 만든다.
2. 같은 입력에 `<식별자>.en.yaml`을 넣어 영어 YAML을 만든다.
3. 두 파일에서 같은 `order` 값을 사용한다.

`.pages.yml`은 `{대표 필드}.{lang}.yaml` 형태의 초깃값과 생성할 때만 보이는 파일 이름 입력을 제공한다. 관리자는 번역 여부와 관계없이 같은 식별자가 되도록 전체 파일 이름을 확인한다. 식별자는 영문 소문자, 숫자, 하이픈만 허용하며 검증기가 이를 강제한다. 예를 들어 `new-project.ko.yaml`과 `new-project.en.yaml`은 한 쌍이다.

Pages CMS는 두 파일을 한 번에 저장하지 못한다. 첫 번째 언어만 저장된 동안에는 편집 브랜치의 콘텐츠 검증이 실패하지만 `main`과 공개 사이트에는 영향이 없다. 두 번째 언어까지 저장한 뒤 검사를 통과한 pull request만 병합한다. 이 두 번의 저장이 실제 사용에서 불편하면 후속 단계에서 “한 항목을 한 파일에 두 언어로 저장”하는 구조로 마이그레이션한다.

### 5.5 삭제

편집 브랜치에서 한국어와 영어 파일을 각각 삭제한다. 한쪽만 삭제된 상태는 콘텐츠 검증에서 실패하므로 pull request를 병합할 수 없다. 프로필과 학력은 삭제 버튼을 제공하지 않는다.

## 6. 콘텐츠 안전장치

### 6.1 검증기

`scripts/validate-content.mjs`와 테스트 가능한 검증 모듈을 추가한다. 검증 범위는 `src/content/` 루트 전체가 아니라 `about`, `projects`, `sideProjects`, `skills`, `education`, `certifications`의 6개 컬렉션 디렉터리다. Astro 설정 파일인 `src/content/config.ts`는 정상 파일로 유지한다.

검증기는 다음 규칙을 검사한다.

- 6개 컬렉션 디렉터리에는 지원하는 YAML 파일만 존재한다.
- 프로필은 `ko.yaml`, `en.yaml`이 정확히 하나씩 존재한다.
- 학력은 현재 렌더링 규칙에 맞춰 언어별 정확히 하나씩 존재한다.
- 나머지 파일 이름은 `<식별자>.<언어>.yaml` 형식이다.
- 모든 항목에 반대 언어 파일이 존재한다.
- 파일 이름의 언어와 YAML의 `lang` 값이 일치한다.
- 번역 쌍의 `order` 값이 일치한다.
- 같은 컬렉션과 언어 안에서 `order`가 중복되지 않는다.
- 프로젝트의 한국어와 영어 항목 수 및 정렬 순서가 일치한다.
- 정렬된 프로젝트에서 `company + role + period`가 바뀌는 위치를 언어별로 계산하고, 한국어와 영어의 그룹 경계 배열 및 첫 그룹 크기가 일치한다.

필드 타입, 필수 필드, URL, 이메일, 최대 불릿 수 같은 개별 파일 검증은 기존 Astro Content Collections의 Zod 스키마와 `astro build`가 담당한다.

### 6.2 실패 처리

- 검증 오류는 컬렉션명, 파일 경로, 고쳐야 할 규칙을 함께 출력한다.
- 검증이나 빌드가 실패하면 배포 작업은 실행하지 않는다.
- GitHub Pages에는 마지막으로 성공한 버전을 계속 제공한다.
- CMS에 저장한 커밋은 삭제하지 않으며, 관리자가 Pages CMS에서 잘못된 값을 수정한다.

## 7. GitHub Actions와 명령

`package.json`에 다음 역할의 명령을 추가한다.

- `test`: 콘텐츠 검증기와 CMS 설정 단위 테스트 실행
- `validate:content`: 실제 `src/content/` 전체 검증
- `test:site`: 이미 생성된 프로덕션 결과의 SEO·폰트 출력 테스트 실행
- `verify`: 단위 테스트, 콘텐츠 검증, 프로덕션 빌드, 사이트 출력 테스트를 순서대로 실행

GitHub Actions는 세 역할로 나눈다.

- `deploy.yml`: `main` push에서 `withastro/action`의 `build-cmd`로 `npm run verify`를 실행하고, 그 과정에서 생성된 `dist`만 GitHub Pages에 배포한다.
- `content-check.yml`: `content/**` 브랜치 push, pull request, `workflow_dispatch`를 지원한다. Pages CMS의 각 저장으로 생긴 최신 head SHA에 검증 결과를 남기는 것이 주 경로다. 수동 실행의 `payload` 입력은 선택 값이며 기본값은 `{}`라서 GitHub UI에서도 별도 JSON 없이 실행할 수 있다.
- `content-publish.yml`: Pages CMS의 `게시 요청`이 현재 편집 브랜치에서 실행한다. `main`에서는 실패하고, `content/`로 시작하는 현재 브랜치에서 `main`을 대상으로 pull request를 새로 만들거나 이미 열린 pull request URL을 반환한다.

`.pages.yml`의 두 action은 모두 `ref: current`를 사용한다. 두 workflow의 `workflow_dispatch.inputs.payload`는 Pages CMS가 보내는 컨텍스트를 받을 수 있지만, 로컬 검증이나 GitHub UI 수동 실행을 막지 않도록 선택 값으로 둔다.

GitHub Actions의 기본 토큰으로 생성한 pull request는 새 `pull_request` workflow를 발생시키지 않을 수 있다. 따라서 필수 검사는 PR 생성 이벤트에만 의존하지 않고, Pages CMS가 편집 브랜치에 저장할 때 발생한 `content/**` push의 최신 head SHA 검사 결과를 사용한다.

검증과 배포 순서는 다음과 같다.

1. 의존성 설치
2. 검증기·CMS 설정 단위 테스트
3. 실제 콘텐츠 쌍 검증
4. Astro 프로덕션 빌드
5. 생성된 사이트의 SEO·폰트 출력 테스트
6. `main` workflow인 경우에만 GitHub Pages 배포

## 8. SEO 설계

### 8.1 언어별 메타데이터

`Layout.astro`는 언어와 현재 URL을 기준으로 다음 값을 출력한다.

- 한국어 canonical: `https://kybee.github.io/`
- 영어 canonical: `https://kybee.github.io/en/`
- `hreflang="ko"`: 한국어 URL
- `hreflang="en"`: 영어 URL
- `hreflang="x-default"`: 한국어 URL
- `description`: 해당 언어 `about.tagline`

Open Graph에는 `website`, title, description, URL, locale, site name과 공유 이미지를 넣는다.

- 한국어 locale: `ko_KR`, alternate locale: `en_US`
- 영어 locale: `en_US`, alternate locale: `ko_KR`
- 공유 이미지: `https://kybee.github.io/og/portfolio.png`
- 이미지 규격: 1200×630 PNG, 언어 중립적인 이름·직함 카드
- 이미지 내용: 현재 사이트의 색상 계열, `YB`, `Youngbeen Kim`, `Backend Engineer`
- 타사 로고, 회사 로고, 새 개인정보는 사용하지 않음

Twitter에는 같은 이미지와 `summary_large_image`, title, description을 제공한다. 공유 이미지는 사이트 본문 레이아웃을 바꾸지 않는 정적 검색·공유 자산이다.

### 8.2 구조화 데이터

페이지마다 `@context: https://schema.org`, `@type: ProfilePage`를 출력하고 `mainEntity`로 `@type: Person`을 포함한다.

- 한국어 ProfilePage URL: `https://kybee.github.io/`
- 영어 ProfilePage URL: `https://kybee.github.io/en/`
- 두 페이지가 공유하는 Person `@id`: `https://kybee.github.io/#person`
- `name`: 해당 언어 `about.name`
- `jobTitle`: 해당 언어 `about.title`
- `description`: 해당 언어 `about.tagline`
- `url`: 해당 언어 페이지의 canonical URL
- GitHub, Blog, LinkedIn을 정확한 허용 목록으로 `sameAs`에 연결
- 현재 콘텐츠에 공개된 값 외의 개인정보는 추가하지 않음

### 8.3 검색엔진 발견 파일

- `@astrojs/sitemap`으로 `/sitemap-index.xml`과 `/sitemap-0.xml` 생성
- sitemap index는 chunk를 가리키고, chunk는 `/`와 `/en/`의 절대 URL을 포함
- `public/robots.txt`에서 전체 크롤링을 허용하고 `https://kybee.github.io/sitemap-index.xml` 안내
- 1:1 `viewBox`와 48px 이상 표시를 고려한 코드 기반 `public/favicon.svg` 추가
- `Layout.astro`에서 `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` 출력

## 9. 폰트 설계

현재 버전 미고정 정적 Pretendard CSS를 아래 버전 고정 동적 서브셋으로 교체한다.

```text
https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css
```

CSS 토큰의 첫 번째 글꼴을 `'Pretendard Variable'`로 바꾸고 기존 시스템 폴백은 유지한다. jsDelivr preconnect도 유지한다.

이 방식은 자체 폰트 파일 관리 없이 현재 모양을 유지하며, 현재 사용 중인 400·600·700 정적 폰트 전체를 내려받는 것보다 전송량을 줄이는 절충안이다.

동적 서브셋은 페이지에 사용된 문자 범위에 따라 여러 WOFF2 조각을 요청하는 것이 정상이다. 성능 확인은 CI의 불안정한 외부 네트워크 대신 브라우저의 캐시 비활성화 상태에서 수동으로 한다. 현재 정적 폰트 기준 약 2.23MiB보다 작고, 한국어와 영어 각 페이지의 Pretendard CSS+폰트 합계가 750KiB 미만이면 완료로 본다.

## 10. 예상 파일 변경

| 파일 | 역할 |
|---|---|
| `.pages.yml` | Pages CMS 메뉴, 필드, CRUD 권한, 커밋 설정 |
| `scripts/lib/content-validation.mjs` | 번역 쌍과 정렬 규칙 검증 |
| `scripts/validate-content.mjs` | 저장소 콘텐츠 검증 진입점 |
| `tests/content-validation.test.mjs` | 검증기 단위 테스트 |
| `tests/pages-config.test.mjs` | CMS 설정과 컬렉션 매핑 테스트 |
| `tests/site-output.test.mjs` | 빌드 결과의 SEO·폰트 메타데이터 테스트 |
| `package.json`, `package-lock.json` | 명령과 직접 의존성 추가 |
| `.github/workflows/deploy.yml` | 배포 전 검증 |
| `.github/workflows/content-check.yml` | PR·GitHub UI·CMS 콘텐츠 검증 |
| `.github/workflows/content-publish.yml` | 현재 편집 브랜치의 pull request 생성 |
| `astro.config.mjs` | sitemap 통합 |
| `src/layouts/Layout.astro` | SEO, 구조화 데이터, 폰트 링크 |
| `src/pages/index.astro` | 한국어 프로필 메타데이터 전달 |
| `src/pages/en/index.astro` | 영어 프로필 메타데이터 전달 |
| `src/styles/tokens.css` | Pretendard Variable 폰트 토큰 |
| `public/robots.txt` | 크롤러와 sitemap 안내 |
| `public/favicon.svg` | 사이트 아이콘 |
| `public/og/portfolio.png` | 1200×630 검색·공유 이미지 |

기존 사용자 변경이 있는 `CLAUDE.md`와 `src/components/Workspace.astro`는 수정하거나 커밋하지 않는다.

## 11. 테스트 전략

### 자동 테스트

- 임시 콘텐츠 디렉터리를 사용해 정상 번역 쌍이 통과하는지 확인한다.
- 누락된 번역, 잘못된 파일명, `lang` 불일치, `order` 불일치와 중복이 각각 실패하는지 확인한다.
- 프로젝트 그룹 경계나 첫 그룹 크기가 언어별로 다르면 실패하는지 확인한다.
- `src/content/config.ts`는 검증 대상 밖에서 허용하고, 컬렉션 디렉터리의 잘못된 확장자는 거부하는지 확인한다.
- `.pages.yml`의 `format`, `merge`, path, type, 필드 이름·타입·필수 여부·중첩 배열, `lang` 선택값, `order` number, commit template을 Astro 스키마와 대조한다.
- 모든 동적 컬렉션의 `filename.field: create`, 파일 이름 template, `operations.rename: false`를 확인한다.
- 프로필과 학력의 생성·삭제가 비활성화되고 다른 컬렉션의 CRUD가 활성화되는지 확인한다.
- `콘텐츠 검사`와 `게시 요청`이 `ref: current` 및 올바른 workflow를 사용하는지 확인한다.
- 두 workflow의 `payload`가 선택 값인지, `게시 요청`이 `main`과 잘못된 브랜치 이름을 거부하는지 확인한다.
- 프로덕션 빌드 결과의 두 HTML에서 description, canonical, 전체 hreflang 집합, Open Graph, Twitter와 공유 이미지 절대 URL을 확인한다.
- JSON-LD를 `JSON.parse`한 뒤 타입, 언어별 URL, 필드 출처, 허용된 `sameAs`, 두 페이지의 동일한 Person `@id`를 확인한다.
- 새 Pretendard URL의 정확한 일치, 구 정적 URL의 부재, 빌드 CSS의 `'Pretendard Variable'` 적용을 확인한다.
- sitemap index가 chunk를 가리키고, chunk가 `/`와 `/en/`의 절대 URL을 포함하며, robots.txt가 index를 가리키는지 확인한다.
- favicon 링크, MIME type, 경로와 SVG의 1:1 `viewBox`를 확인한다.

### 수동 확인

- Pages CMS에서 저장소가 열리고 모든 관리 메뉴가 보이는지 확인한다.
- Pages CMS에서 `content/test-cms` 브랜치를 만들고 기존 항목 수정 커밋이 그 브랜치에만 생성되는지 확인한다.
- 테스트용 번역 쌍을 추가하고 삭제한 뒤 `콘텐츠 검사`가 정상 동작하는지 확인한다.
- `게시 요청`이 pull request를 만들고, 필수 검사가 성공한 PR만 `main`에 병합할 수 있는지 확인한다.
- 병합 후 GitHub Actions 검증과 Pages 배포가 순서대로 성공하는지 확인한다.
- 데스크톱과 모바일에서 기존 레이아웃과 글꼴 인상이 유지되는지 확인한다.
- 브라우저 캐시를 비활성화한 Network 패널에서 각 언어 페이지의 Pretendard CSS+폰트 합계가 750KiB 미만인지 확인한다.

## 12. 완료 기준

- 사용자는 로컬 명령 없이 Pages CMS에서 지원 콘텐츠를 관리할 수 있다.
- 콘텐츠 변경은 편집 브랜치의 GitHub 커밋으로 남고, 필수 검사를 통과한 pull request만 `main`에 병합·배포된다.
- 한국어와 영어 파일의 구조적 불일치가 자동으로 차단된다.
- `/`와 `/en/`의 SEO 메타데이터, JSON-LD, 공유 이미지, sitemap, robots.txt, favicon이 빌드 결과에 존재한다.
- Pretendard 요청은 버전 고정 Variable 동적 서브셋을 사용한다.
- 캐시 비활성화 상태의 언어별 Pretendard CSS+폰트 전송량은 750KiB 미만이다.
- `npm run verify`가 성공한다.
- 기존 사용자 변경과 현재 시각 레이아웃은 보존된다.

## 13. 운영 시 사용자가 한 번 해야 하는 일

코드 배포 후 사용자는 다음 작업만 한 번 수행한다.

1. `https://app.pagescms.org`에 자신의 GitHub 계정으로 로그인한다.
2. Pages CMS GitHub App을 설치한다.
3. 저장소 접근 범위를 `KYBee.github.io` 하나로 제한한다.
4. GitHub Actions에 read/write 권한과 pull request 생성 권한을 허용한다.
5. `main` ruleset에 pull request와 `content-check` 성공을 필수 조건으로 설정한다.
6. Pages CMS에서 저장소를 열고, 콘텐츠 작업마다 최신 `main`에서 `content/<작업명>` 브랜치를 만든다.
7. 편집 후 `게시 요청`을 누르고 GitHub에서 검사가 성공한 pull request를 병합한다.

Pages CMS 로그아웃은 CMS 세션만 종료하며 `github.com` 자체의 로그인 상태와는 별개다. GitHub App의 저장소 접근을 완전히 없애려면 GitHub 설정에서 앱 설치를 제거한다.

## 14. 참고 문서

- [Pages CMS 소개와 GitHub 저장 방식](https://pagescms.org/docs/)
- [Pages CMS 콘텐츠 설정](https://pagescms.org/docs/configuration/content/)
- [Pages CMS 파일 이름 설정](https://pagescms.org/docs/configuration/content/filename/)
- [Pages CMS GitHub Actions 버튼](https://pagescms.org/docs/configuration/actions/)
- [Google canonical 안내](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google 다국어 페이지 안내](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google ProfilePage 구조화 데이터 안내](https://developers.google.com/search/docs/appearance/structured-data/profile-page)
- [Open Graph protocol](https://ogp.me/)
- [Google favicon 안내](https://developers.google.com/search/docs/appearance/favicon-in-search)
- [Astro sitemap 통합](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [Pretendard 웹폰트 안내](https://github.com/orioncactus/pretendard/blob/main/packages/pretendard/docs/en/README.md)
