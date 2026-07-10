# Youngbeen Kim — Portfolio Site Content (English, v2.0)

> Content source for /en/. Mirrors content.md v2.0.

---

## 0. Header

- Left (logo): **KYBee**
- Right: KO | EN language links

---

## 1. Hero

- **Name**: Youngbeen Kim
- **Title**: Backend Engineer @ Samsung Electronics
- **Tagline**: A backend engineer who turns logs into quality metrics and repetitive operations into automation
- **Location**: Suwon, South Korea

### Links
- GitHub: https://github.com/KYBee
- Blog: https://nullnull.tistory.com (Korean)
- LinkedIn: https://www.linkedin.com/in/kybee/
- Email: kyb3634@gmail.com

---

## 2. About

- I build and operate the backend of a backup/restore service for tens of millions of users at Samsung Electronics. (Java/Spring, AWS, Kafka)
- I'm good at turning operational logs into metrics, and automating repetitive analysis with pipelines and AI agents.
- Certified in-house Best Reviewer for code review grounded in Clean Code and TDD.

---

## 3. Experience

### Samsung Electronics — Backend Engineer
**Sep 2023 – Present · Suwon**

#### User-Perceived Backup/Restore Success Rate Metrics
Defined and automated a metric for whether a user's operation actually succeeded end-to-end — invisible to per-API success rates

- Redefined success rate over user-operation transactions; separated distorting cases (retries, user cancellations)
- Built a daily-refreshing pipeline and dashboard with Airflow + Grafana
- Drove improvement actions: **success rate 70% → 95%**

`Python` `Airflow` `PySpark` `Grafana`

#### SLI/SLO Anomaly Analysis & Reporting Automation
Replaced manual log digging and Slack reporting with an AI agent workflow

- Automated condition extraction from alert payloads, log collection, and request/trId-level clustering
- Chained a root-cause-analysis agent and a report agent posting standardized summaries to Slack
- **Analysis-to-report time: up to 4 hours → ~10 minutes**

`Python` `FastAPI` `Slack API` `Airflow`

#### "AgentHub" — AI Agent Session Manager
One screen for the status and control of scattered AI agent sessions — solo, from planning to deployment

- Built tmux session collection, status badges (running / waiting / approval needed / error), web terminal attach
- Shipped as an Electron/React desktop app to the internal Tool Store
- **Ranked #3 in recommendations among 15 tools**, in active daily use by other developers

`TypeScript` `React` `Electron` `tmux` `WebSocket`

#### Service Runtime Modernization (Java 25 · K8s · Graviton)
Laid the groundwork to migrate build, CI, and metrics architecture in one coordinated move

- Updated build/test tooling for Java 25; refreshed CI workflows and Docker base images
- Migrated K8s metrics to OTLP (OpenTelemetry); set up ARM configs for Graviton validation
- Analyzed AWS SDK v1→v2 timeout and DynamoDB behavior differences; corrected acceptance tests

`Java 25` `Spring Boot` `Kubernetes` `OpenTelemetry` `GitHub Actions`

#### Also
- Expanded E2E tests for core backup/restore scenarios; removed flaky tests with embedded Kafka
- Built a team Jupyter/PySpark log-analysis tool; automated weekly work-logs via GitHub + LLM summarization

### Shinyoung Securities — Software Engineering Intern
**Sep 2021 – Dec 2021 · Seoul** · Node.js

### maum.ai — Software Engineering Intern
**Jun 2020 – Dec 2020 · Pangyo** · Python, Flask

---

## 4. Side Projects & Activities

- **SSAFY Attendance Excuse Generator** (Vue) — a utility with real users
- **CPS** — classroom intrusion detection system (Python), tied to my industrial security major

SSAFY 8th · UMC · GDSC CAU · Pirogramming · SOPT

---

## 5. Skills

- **Backend**: Java, Spring Boot, Python, FastAPI
- **Data**: Airflow, PySpark, Kafka, InfluxDB
- **Infra**: AWS (DynamoDB, S3), Kubernetes, Docker, GitHub Actions
- **Observability**: OpenTelemetry, Grafana, Prometheus

---

## 6. Education & Certifications

- **Chung-Ang University** — B.S. in Industrial Security & Software (double major), 2016–2022, honors, GPA 4.14/4.5
- Engineer Information Processing · SQLD · Big-Data Analysis Engineer

Korean (native) · English (advanced) · Chinese (intermediate)

---

## 7. Site Constraints (do not change)

1. One page per language (/, /en/), KO | EN links in header
2. No dark mode, no animations
3. Pretendard font only, 3 colors max
