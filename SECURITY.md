# Security Policy

## 1. Supported Versions

Security updates and patches are actively maintained for the following versions and branches:

| Version / Branch | Supported | Security Maintenance Level |
| :--- | :---: | :--- |
| `main` (Latest development) | Yes | Continuous automated scanning and immediate patch release |
| `v1.0.x` (Release candidate) | Yes | Critical and high-severity vulnerability backports |
| `< 1.0.0` | No | Deprecated development iterations; upgrade to `main` |

---

## 2. Reporting a Vulnerability

The CampusUNSA engineering team is committed to the security and privacy of the university community. If you discover a security vulnerability, do NOT open a public GitHub issue.

### Preferred Reporting Channels
1. **GitHub Private Vulnerability Reporting:** Navigate to the **Security** tab of the repository and click **"Report a vulnerability"**.
2. **Security Contact:** Send an encrypted or direct email to `security-campusunsa@unsa.edu.pe` (or contact the Project Lead: `@MarcoXMarquez`).

### Information to Include in Your Report
To help us triage and reproduce the issue rapidly, please include:
- A descriptive title and summary of the vulnerability.
- Step-by-step instructions or Proof of Concept (PoC) scripts to reproduce the defect.
- Target component (Backend FastAPI, Next.js PWA, Redis OTP Cache, or WhatsApp Gateway).
- Potential impact (e.g., unauthorized privilege escalation, JWT manipulation, data leakage).
- Any proposed remediation or mitigation.

---

## 3. Vulnerability Response Timeline (SLAs)

We adhere to coordinated vulnerability disclosure standards:
- **Initial Acknowledgment:** Within 48 hours of report submission.
- **Triage & Severity Assessment:** Within 5 business days, evaluating CVSS score.
- **Fix & Patch Deployment:** Critical severity within 7 calendar days; medium/low within the regular sprint cycle (14-30 days).
- **Public Disclosure:** Coordinated only after the fix has been verified and deployed to production.

---

## 4. Institutional Security Invariants

All contributions must strictly respect the following architectural constraints:

1. **Email Domain Boundary:**
   - Only institutional accounts verified under the `@unsa.edu.pe` domain are permitted.
   - External domains (e.g., `@gmail.com`) must be rejected with HTTP 403 and error code `DOMAIN_NOT_ALLOWED`.
2. **WhatsApp OTP TTL:**
   - OTP verification tokens stored in Redis must strictly expire after exactly 300 seconds (5 minutes).
3. **Role-Based Access Control (RBAC):**
   - Endpoints managing administrative tasks or tickets must strictly require staff/secretarial roles.
4. **Denial-of-Service & Resource Admission:**
   - Database operations must respect bounded concurrency enforced via `RequestCapacityMiddleware` to prevent connection pool exhaustion.

---

## 5. Out of Scope

The following activities are strictly prohibited and outside the scope of security research:
- Performing automated denial-of-service (DoS/DDoS) attacks against production infrastructure.
- Scanning or attacking third-party university endpoints (DUTIC Moodle, SISUNSA, Google Workspace).
- Social engineering, phishing, or physical attacks targeting university staff or students.
