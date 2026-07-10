# 김영빈 — Portfolio Site Content (v1.0)

> 정적 사이트 생성의 단일 소스(Single Source of Truth).
> ⚠️ 공개 금지: 내부 시스템명(CTB/NTC/DPL 등), 회사 repo 경로, 생년월일/학번/자격증 식별번호, 이직 관련 내용.

---

## 1. Hero

- **이름**: 김영빈 (Youngbeen Kim)
- **타이틀**: Backend Engineer @ Samsung Electronics
- **한 줄 소개**: 로그를 품질 지표로, 반복 운영 업무를 자동화된 워크플로우로 바꾸는 백엔드 엔지니어입니다.
- **위치**: Suwon, South Korea

### Links
- GitHub: https://github.com/KYBee
- Blog: https://nullnull.tistory.com
- LinkedIn: https://www.linkedin.com/in/kybee/
- Email: [TODO — 공개용 이메일]

---

## 2. About

삼성전자 MX사업부 Cloud팀에서 사용자 단말 데이터 백업/복원 서비스의 백엔드 개발과 운영을 담당하고 있습니다. Java/Spring 기반 분산 서버를 대규모 트래픽 환경에서 운영하며, AWS(DynamoDB, S3), Kafka 연동 시스템의 기능 개선과 장애 대응을 수행합니다.

운영 로그를 단순 기록이 아닌 품질 판단의 근거로 만드는 일에 관심이 많습니다. Airflow/Python 기반으로 사용자 체감 품질 지표 파이프라인을 구축했고, AI Agent를 운영 프로세스에 도입해 이상 지표 분석과 리포팅을 자동화했습니다.

Clean Code·TDD 기반 코드 리뷰 활동으로 사내 Best Reviewer 자격을 취득했습니다.

---

## 3. Experience

### 삼성전자 — Backend Engineer (Cloud서비스Platform그룹)
**2023.09 – 현재 · 수원**

#### 주요 프로젝트

**1) 사용자 체감 백업/복원 성공률 지표 및 대시보드 구축**
- 문제: API 단건 성공률만으로는 사용자가 실행한 백업/복원 작업 하나가 최종 성공했는지 알 수 없었음. auto retry, partial complete, 사용자 중단 케이스가 지표를 왜곡.
- 한 일: API 호출 흐름을 사용자 작업 단위 트랜잭션으로 묶어 성공률을 재정의. 왜곡 케이스(사용자 중단, 자동 재개 등) 분리 로직 설계. Airflow DAG + Grafana 시각화로 매일 자동 갱신되는 파이프라인 구축. 실패 원인 추적용 보조지표 정의.
- 성과: 지표 기반 개선 액션 도출로 **성공률 약 70% → 95% 개선**.
- 기술: `Python` `Airflow` `PySpark` `InfluxDB` `Grafana` `S3`

**2) SLI/SLO 이상 분석·리포팅 자동화 (AI Agent Workflow)**
- 문제: 지표 경고 발생 시 로그 탐색 → 원인 추정 → Slack 공유가 전부 수동이고 담당자마다 방식이 달라 최대 4시간 소요.
- 한 일: 경고 alert payload에서 분석 조건을 추출하고, 로그를 request/trId 단위로 클러스터링해 root cause 왜곡 문제 해결. 원인 분석 Agent → 리포트 생성 Agent → Slack 공유로 이어지는 자동화 워크플로우 설계·구축.
- 성과: **원인 분석·보고 시간 최대 4시간 → 약 10분**으로 단축, 리포트 형식 표준화.
- 기술: `Python` `FastAPI` `Slack API` `PySpark` `Airflow` `Jupyter`

**3) AI Agent 세션 컨트롤 센터 "AgentHub" 개발·배포**
- 문제: Claude/Codex/Gemini 등 여러 AI Agent를 병렬로 쓰면 세션이 터미널 곳곳에 흩어져 실행 중/입력 대기/승인 필요 상태를 놓치기 쉬움.
- 한 일: tmux 세션 정보를 수집해 경로별·에이전트별로 묶어 관리하는 Electron/React 데스크탑 앱을 기획부터 배포까지 단독 수행. pane snapshot 기반 상태 감지 배지, xterm.js + WebSocket 웹 터미널 attach, 스킬 레지스트리·프롬프트 삽입 기능 구현.
- 성과: 사내 Tool Store 배포, **전체 15개 도구 중 추천 순위 3위**. 실제 개발자들이 업무에 사용 중.
- 기술: `TypeScript` `React` `Electron` `tmux` `WebSocket` `xterm.js`

**4) 서비스 런타임 현대화 — Java 25 / K8S / Graviton 전환 기반 구축**
- 문제: 런타임 업그레이드에 빌드·테스트 도구, Docker image, CI, JVM 옵션, 메트릭 수집 구조 전환이 얽혀 있었음.
- 한 일: Maven/Lombok/AWS SDK/JaCoCo 등 Java 25 호환 갱신, GitHub Actions reusable workflow·Docker base image 갱신, K8S metrics의 OTLP(OpenTelemetry) 전환, ARM nodeAffinity 설정으로 Graviton 검증 기반 구축. AWS SDK v1→v2 전환 시 timeout 의미 차이·DynamoDB 동작 차이 분석 및 acceptance test 보정.
- 기술: `Java 25` `Spring Boot` `Kubernetes` `Helm` `OpenTelemetry` `GitHub Actions` `Graviton(ARM)`

#### 그 외
- 백업/복원 주요 시나리오 E2E/acceptance test 확장, embedded Kafka 도입으로 flaky 테스트 제거
- 팀 로그 분석용 Jupyter/PySpark 인터페이스 도구 개발·배포 (v3까지 개선)
- GitHub PR/commit → LLM 요약 → Obsidian 저장하는 주간 work-log 자동화 파이프라인 구축
- **사내 Best Reviewer 자격 취득** — Clean Code, Refactoring, TDD 기반 리뷰 활동

### 삼성전자 — Recruiting T/F
**2023.01 – 2023.09 · 수원**

### 신영증권 — 개발 인턴
**2021.09 – 2021.12 · 서울** — Node.js, AJAX 기반 개발

### 마음AI (maum.ai) — 개발 인턴
**2020.06 – 2020.12 · 판교** — Flask, Python 기반 개발

---

## 4. Side Projects & Activities

- **SSAFY 출결 소명서 생성기** (Vue) — 실사용자가 있는 유틸리티 도구
- **CPS** — 강의실 침입 탐지 시스템 (Python), 산업보안 전공 연계 프로젝트
- **DOWITH** — 루틴 형성 서비스

### Activities
SSAFY 8기 (Java 트랙) · UMC (Node.js) · GDSC CAU · 피로그래밍 14기 · SOPT 26기

---

## 5. Skills

- **언어**: Java, Python, TypeScript
- **백엔드**: Spring Boot, FastAPI(경험), Node.js(경험)
- **데이터/파이프라인**: Airflow, PySpark, InfluxDB, JupyterHub, Kafka
- **인프라/배포**: AWS (DynamoDB, S3, KMS, Lambda), Kubernetes, Helm, Docker, GitHub Actions
- **관측성**: OpenTelemetry, Grafana, Prometheus
- **프론트/도구**: React, Electron

---

## 6. Education & Certifications

- **중앙대학교** — 산업보안학과 · 소프트웨어학부 복수전공 (2016–2022, 우등 졸업, GPA 4.14/4.5)
- 정보처리기사 (2021) · SQLD (2021) · 빅데이터분석기사 (2024)

### Languages
한국어 (모국어) · 영어 (상급) · 중국어 (중급, 업무 의사소통 가능)

---

## 7. 사이트 제약 (테마 함정 방지 — 변경 금지)

1. 원페이지 (섹션 앵커 네비게이션만)
2. 다크모드 토글 없음, 애니메이션 없음
3. 폰트: Pretendard 1개 (또는 시스템 폰트)
4. 색상: 배경 1 + 텍스트 1 + 포인트 컬러 1, 총 3색
5. 오늘 GitHub Pages 배포가 완성 기준
