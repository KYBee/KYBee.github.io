# Youngbeen Kim — Portfolio Site Content (v1.0)

> Single Source of Truth for static site generation.
> ⚠️ Do not disclose: Internal system names (CTB/NTC/DPL, etc.), company repo paths, personal identifiers, job search related content.

---

## 1. Hero

- **Name**: Youngbeen Kim (김영빈)
- **Title**: Backend Engineer @ Samsung Electronics
- **Tagline**: A backend engineer who transforms logs into quality metrics and repetitive operations into automated workflows.
- **Location**: Suwon, South Korea

### Links
- GitHub: https://github.com/KYBee
- Blog: https://nullnull.tistory.com
- LinkedIn: https://www.linkedin.com/in/kybee/
- Email: [TODO — public email]

---

## 2. About

I work as a backend developer at Samsung Electronics MX Division Cloud Team, responsible for developing and operating user device data backup/restore services. I operate Java/Spring-based distributed servers in high-traffic environments, improving features and handling incidents for systems integrated with AWS (DynamoDB, S3) and Kafka.

I'm passionate about turning operational logs into evidence for quality decisions rather than mere records. I built user experience quality metric pipelines using Airflow/Python and introduced AI Agents into operational processes to automate anomaly analysis and reporting.

I earned the company's Best Reviewer certification through Clean Code and TDD-based code review activities.

---

## 3. Experience

### Samsung Electronics — Backend Engineer (Cloud Service Platform Group)
**2023.09 – Present · Suwon**

#### Key Projects

**1) User-Perceived Backup/Restore Success Rate Metrics & Dashboard**
- Problem: Single API success rates couldn't determine if a user's backup/restore job ultimately succeeded. Auto retry, partial complete, and user cancellation cases skewed metrics.
- What I did: Redefined success rate by grouping API call flows into user job-level transactions. Designed logic to separate skewing cases (user cancellation, auto-resume, etc.). Built daily auto-updating pipeline with Airflow DAG + Grafana visualization. Defined auxiliary metrics for failure cause tracking.
- Result: **Improved success rate from ~70% to 95%** through metric-based improvement actions.
- Tech: `Python` `Airflow` `PySpark` `InfluxDB` `Grafana` `S3`

**2) SLI/SLO Anomaly Analysis & Reporting Automation (AI Agent Workflow)**
- Problem: When metric alerts fired, log searching → root cause estimation → Slack sharing was entirely manual with inconsistent methods, taking up to 4 hours.
- What I did: Extracted analysis conditions from alert payloads and clustered logs by request/trId to resolve root cause distortion. Designed and built automated workflow: Analysis Agent → Report Generation Agent → Slack sharing.
- Result: **Reduced analysis & reporting time from 4 hours to ~10 minutes**, standardized report format.
- Tech: `Python` `FastAPI` `Slack API` `PySpark` `Airflow` `Jupyter`

**3) AI Agent Session Control Center "AgentHub" Development & Deployment**
- Problem: When using multiple AI Agents (Claude/Codex/Gemini) in parallel, sessions scattered across terminals made it easy to miss running/input waiting/approval needed states.
- What I did: Solo-developed an Electron/React desktop app from planning to deployment that collects tmux session info and groups them by path and agent type. Implemented pane snapshot-based status detection badges, xterm.js + WebSocket web terminal attach, skill registry & prompt injection features.
- Result: Deployed to internal Tool Store, **ranked 3rd in recommendations among 15 tools**. Actively used by developers.
- Tech: `TypeScript` `React` `Electron` `tmux` `WebSocket` `xterm.js`

**4) Service Runtime Modernization — Java 25 / K8S / Graviton Migration Foundation**
- Problem: Runtime upgrades were tangled with build/test tools, Docker images, CI, JVM options, and metrics collection structure transitions.
- What I did: Updated Maven/Lombok/AWS SDK/JaCoCo for Java 25 compatibility, updated GitHub Actions reusable workflows & Docker base images, migrated K8S metrics to OTLP (OpenTelemetry), set up ARM nodeAffinity for Graviton validation. Analyzed timeout semantics and DynamoDB behavior differences during AWS SDK v1→v2 migration, corrected acceptance tests.
- Tech: `Java 25` `Spring Boot` `Kubernetes` `Helm` `OpenTelemetry` `GitHub Actions` `Graviton(ARM)`

#### Other
- Extended E2E/acceptance tests for major backup/restore scenarios, eliminated flaky tests with embedded Kafka
- Developed and deployed team log analysis Jupyter/PySpark interface tool (improved to v3)
- Built weekly work-log automation pipeline: GitHub PR/commit → LLM summary → Obsidian storage
- **Earned company Best Reviewer certification** — Clean Code, Refactoring, TDD-based review activities

### Samsung Electronics — Recruiting T/F
**2023.01 – 2023.09 · Suwon**

### Shinyoung Securities — Development Intern
**2021.09 – 2021.12 · Seoul** — Node.js, AJAX-based development

### maum.ai — Development Intern
**2020.06 – 2020.12 · Pangyo** — Flask, Python-based development

---

## 4. Side Projects & Activities

- **SSAFY Attendance Appeal Generator** (Vue) — Utility tool with real users
- **CPS** — Classroom Intrusion Detection System (Python), Industrial Security major project
- **DOWITH** — Routine Building Service

### Activities
SSAFY 8th (Java Track) · UMC (Node.js) · GDSC CAU · Pirogramming 14th · SOPT 26th

---

## 5. Skills

- **Languages**: Java, Python, TypeScript
- **Backend**: Spring Boot, FastAPI (experienced), Node.js (experienced)
- **Data/Pipeline**: Airflow, PySpark, InfluxDB, JupyterHub, Kafka
- **Infrastructure/Deploy**: AWS (DynamoDB, S3, KMS, Lambda), Kubernetes, Helm, Docker, GitHub Actions
- **Observability**: OpenTelemetry, Grafana, Prometheus
- **Frontend/Tools**: React, Electron

---

## 6. Education & Certifications

- **Chung-Ang University** — Industrial Security · Software (Double Major) (2016–2022, Graduated with Honors, GPA 4.14/4.5)
- Engineer Information Processing (2021) · SQLD (2021) · Big Data Analyst (2024)

### Languages
Korean (Native) · English (Advanced) · Chinese (Intermediate, business communication capable)

---

## 7. Site Constraints (Theme Trap Prevention — Do Not Change)

1. Single page (section anchor navigation only)
2. No dark mode toggle, no animations
3. Font: Pretendard only (or system font)
4. Colors: 1 background + 1 text + 1 accent, total 3 colors
5. GitHub Pages deployment today is the completion criteria
