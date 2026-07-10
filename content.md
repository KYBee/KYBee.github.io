# 김영빈 — Portfolio Site Content (v2.0)

> 정적 사이트의 단일 콘텐츠 소스.
> ⚠️ 공개 금지: 내부 시스템명, 회사 repo 경로, 개인 식별정보, 이직 관련 내용.

---

## 0. Header

- 좌측(로고): **KYBee**
- 우측: KO | EN 언어 링크

---

## 1. Hero

- **이름**: 김영빈
- **타이틀**: Backend Engineer @ Samsung Electronics
- **한 줄 소개**: 로그를 품질 지표로, 반복 운영을 자동화로 바꾸는 백엔드 엔지니어
- **위치**: Suwon, South Korea

### Links
- GitHub: https://github.com/KYBee
- Blog: https://nullnull.tistory.com
- LinkedIn: https://www.linkedin.com/in/kybee/
- Email: kyb3634@gmail.com

---

## 2. About

- 삼성전자에서 수천만 사용자 규모 백업/복원 서비스의 백엔드를 개발·운영합니다. (Java/Spring, AWS, Kafka)
- 운영 로그를 지표로 만들고, 반복 분석 업무를 파이프라인과 AI Agent로 자동화하는 일을 잘합니다.
- Clean Code·TDD 기반 리뷰 활동으로 사내 Best Reviewer 자격을 취득했습니다.

---

## 3. Experience

### 삼성전자 — Backend Engineer
**2023.09 – 현재 · 수원**

#### 사용자 체감 백업/복원 성공률 지표 구축
API 단건 성공률로는 보이지 않던 "사용자 작업 단위" 성공 여부를 지표로 정의하고 자동화

- API 호출 흐름을 사용자 트랜잭션 단위로 묶어 성공률 재정의, 왜곡 케이스(재시도·사용자 중단) 분리
- Airflow + Grafana로 매일 자동 갱신되는 지표 파이프라인·대시보드 구축
- 지표 기반 개선 액션으로 **성공률 70% → 95%**

`Python` `Airflow` `PySpark` `Grafana`

#### SLI/SLO 이상 분석·리포팅 자동화
경고 발생 시 로그 탐색부터 Slack 보고까지 수동이던 분석 업무를 AI Agent workflow로 전환

- alert payload에서 분석 조건 추출 → 로그 수집 → request/trId 단위 클러스터링 자동화
- 원인 분석 Agent → 리포트 생성 Agent → Slack 공유로 이어지는 흐름 설계
- **분석·보고 시간 최대 4시간 → 약 10분**, 리포트 형식 표준화

`Python` `FastAPI` `Slack API` `Airflow`

#### AI Agent 세션 관리 도구 "AgentHub" 개발·배포
흩어진 AI Agent 세션의 상태 확인과 제어를 한 화면으로 — 기획부터 배포까지 단독 수행

- tmux 세션 수집, 상태 배지(실행 중/입력 대기/승인 필요/에러), 웹 터미널 attach 구현
- Electron/React 데스크탑 앱으로 사내 Tool Store 배포
- **전체 15개 도구 중 추천 순위 3위**, 실제 개발자들이 업무에 사용 중

`TypeScript` `React` `Electron` `tmux` `WebSocket`

#### 서비스 런타임 현대화 (Java 25 · K8S · Graviton)
런타임 업그레이드에 얽힌 빌드·CI·메트릭 구조를 한 번에 전환할 수 있는 기반 구축

- 빌드/테스트 도구 Java 25 호환 갱신, CI workflow·Docker base image 정비
- K8S 메트릭 OTLP(OpenTelemetry) 전환, ARM 설정으로 Graviton 검증 기반 마련
- AWS SDK v1→v2 전환 시 timeout·DynamoDB 동작 차이 분석, acceptance test 보정

`Java 25` `Spring Boot` `Kubernetes` `OpenTelemetry` `GitHub Actions`

#### 그 외
- 백업/복원 핵심 시나리오 E2E 테스트 확장, embedded Kafka로 flaky 테스트 제거
- 팀 로그 분석용 Jupyter/PySpark 도구 개발·배포, GitHub 활동 → LLM 요약 work-log 자동화

### 신영증권 — 개발 인턴
**2021.09 – 2021.12 · 서울** · Node.js

### 마음AI (maum.ai) — 개발 인턴
**2020.06 – 2020.12 · 판교** · Python, Flask

---

## 4. Side Projects & Activities

- **SSAFY 출결 소명서 생성기** (Vue) — 실사용자가 있는 유틸리티
- **CPS** — 강의실 침입 탐지 시스템 (Python), 산업보안 전공 연계

SSAFY 8기 · UMC · GDSC CAU · 피로그래밍 · SOPT

---

## 5. Skills

- **Backend**: Java, Spring Boot, Python, FastAPI
- **Data**: Airflow, PySpark, Kafka, InfluxDB
- **Infra**: AWS (DynamoDB, S3), Kubernetes, Docker, GitHub Actions
- **Observability**: OpenTelemetry, Grafana, Prometheus

---

## 6. Education & Certifications

- **중앙대학교** — 산업보안학과 · 소프트웨어학부 복수전공 (2016–2022, 우등 졸업, GPA 4.14/4.5)
- 정보처리기사 · SQLD · 빅데이터분석기사

한국어 (모국어) · 영어 (상급) · 중국어 (중급)

---

## 7. 사이트 제약 (변경 금지)

1. 언어별 원페이지 (/, /en/), 헤더에 KO | EN 링크
2. 다크모드 없음, 애니메이션 없음
3. Pretendard 폰트 1개, 3색 제한
