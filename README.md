# KSR College of Engineering — Library Management System (LMS)

A complete, database-driven institutional Library Management System designed for **KSR College of Engineering, Tiruchengode, Tamil Nadu, India**.

---

## 1. Key Capabilities

- **Role-Based Access Control (4 Roles)**:
  - **Super Administrator (`SuperAdmin`)**: Global borrowing & fine policies, staff account provisioning, audit logs, reports, and full circulation control.
  - **Librarian (`Librarian`)**: Book catalog CRUD, physical barcoded inventory (`KSR-ACC-...`), student/faculty registration & CSV bulk import, 10-step Issue Desk, Quick Return Desk, renewals, reservation queue management, and fine collection/waivers.
  - **Student (`Student`)**: Self-service OPAC catalog search, copy availability by rack/shelf, current loans, online renewal requests, title reservations, fine balance & receipt history, and in-app notifications.
  - **Faculty Member (`Faculty`)**: Self-service catalog access with extended faculty borrowing limits (default: 5 books, 28-day loan period).
- **Bibliographic vs. Physical Inventory Separation**:
  - Total copy counts and available copy counts are dynamically derived from actual `PhysicalBookCopies` records.
  - Enforces valid state transitions (`Available`, `Issued`, `Reserved`, `Damaged`, `UnderMaintenance`, `Lost`) and prevents double-issuing.
- **Configurable Circulation & Fine Policy**:
  - Default demonstration policy (configurable at `/admin/settings`):
    - **Student Loan Period**: 14 days (Limit: 3 books)
    - **Faculty Loan Period**: 28 days (Limit: 5 books)
    - **Overdue Fine Rate**: ₹2.00 per day past the due date (the due date itself is chargeable only after 23:59:59 UTC of that date; optional Sunday exclusion setting).
    - **Renewal Limit**: 2 renewals per loan (blocked if another member is waiting in the reservation queue or if the loan is overdue).

---

## 2. Technology Stack & Runtime Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, React Router v7, TanStack Query v5, Zod.
- **Backend & Persistence**:
  - **Live Containerized Runtime (`server.ts`)**: Express REST API (`/api/*`) backed by Node 22's native relational SQL engine (`node:sqlite` in WAL mode with foreign keys, unique constraints, and ACID transactions persisted to `./database/ksr_library.db`).
  - **SQL Server Deployment Artifacts**: Complete T-SQL schema (`database/scripts/01_sqlserver_schema_and_migrations.sql`) and `docker-compose.yml` for SQL Server 2022 Developer Edition.
  - **OpenAPI / Swagger Specification**: Available at `GET /api/swagger.json` and health check at `GET /api/health`.

---

## 3. Demonstration Credentials (Development Seed)

All sample records are synthetic demonstration data. On the `/login` page, you can either type these credentials or use the **One-Click Role Verification** panel:

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Super Administrator** | Dr. R. Karthikeyan | `admin@ksrce.ac.in` | `KsrAdmin@2026` |
| **Senior Librarian** | S. Meenakshi Sundaram | `librarian@ksrce.ac.in` | `KsrLibrary@2026` |
| **Student (B.E. CSE)** | Aravind Kumar S. | `student.cs01@ksrce.ac.in` | `KsrStudent@2026` |
| **Faculty Member** | Dr. P. Balasubramani | `faculty.cse@ksrce.ac.in` | `KsrFaculty@2026` |

---

## 4. Local Setup, Build & Test Commands

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Run automated unit & database integration tests
npm test

# 4. Start full-stack development server on http://localhost:3000
npm run dev

# 5. Build production frontend bundle
npm run build
```
