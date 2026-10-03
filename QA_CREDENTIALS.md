# PrimePlate QA Environment — Credentials & Testing Guide

This environment is completely isolated from production and connected to the **Supabase QA PostgreSQL** database.

---

## 1. Unified QA Password

All synthetic QA accounts share the following password:

```text
QaPrimePlate@2026!
```

> **Security Note:** Passwords are fully hashed using bcrypt (`$2b$10$...`) directly inside the database. No production passwords or production password hashes are ever used.

---

## 2. QA Accounts Directory

| Role | Email | Name / Entity | Purpose / Test Scenario |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@qa.primeplate.local` | QA Platform Admin | Admin portal access, provider management, support tickets, settlements. |
| **Provider A** | `provider1@qa.primeplate.local` | Spice & Soul Tiffin Service | Active & approved. Meal Recovery **ENABLED (80%)**. Has 4 images, menus, earnings, check-ins. |
| **Provider B** | `provider2@qa.primeplate.local` | Green Bowl Healthy Meals | Active & approved. Meal Recovery **DISABLED (0%)**. Tests provider-specific differential behavior. |
| **Student 1** | `student1@qa.primeplate.local` | Aarav Sharma | **Active FULL_DAY** subscription + **PARTIALLY_USED** meal recovery (2 days remaining). |
| **Student 2** | `student2@qa.primeplate.local` | Priya Patel | **Expired FULL_DAY** subscription + **AVAILABLE** meal recovery (4 days eligible). |
| **Student 3** | `student3@qa.primeplate.local` | Rohan Verma | **Dual Active Subscriptions**: 1 Active **LUNCH_ONLY** + 1 Active **DINNER_ONLY** across different meal windows. |
| **Student 4** | `student4@qa.primeplate.local` | Ananya Iyer | **Provider B FULL_DAY** active subscription + 1 expired subscription. Tests clean slate check-ins and disabled recovery provider. |

---

## 3. Seeded Entities & Test Data Summary

- **Users:** 7 accounts (1 Admin, 2 Providers, 4 Students).
- **Meal Plans (6 plans):**
  - Provider A: FULL_DAY (30d), LUNCH_ONLY (30d), DINNER_ONLY (30d), Single-day Trial (₹150), Inactive Special Festive Combo (disabled flag test).
  - Provider B: FULL_DAY (30d).
- **Subscriptions (6 subscriptions):**
  - Active FULL_DAY, Expired FULL_DAY eligible for recovery, Active LUNCH_ONLY, Active DINNER_ONLY, Active Provider B FULL_DAY, Expired sub.
- **Meal Usages (11 records + 1 audit):**
  - Covers today's check-ins (LUNCH & DINNER), past check-ins, missed days, dual lunch+dinner on same date, and 1 manual `PROVIDER_CORRECTION` audit record.
- **Meal Recovery (2 balances):**
  - 1 `AVAILABLE` (4 days remaining for Student 2).
  - 1 `PARTIALLY_USED` (2 days remaining for Student 1).
  - *Strictly 0 recoveries created for LUNCH_ONLY or DINNER_ONLY subscriptions.*
- **Reviews (3 reviews):**
  - 5-star, 4-star, and 4-star verified student reviews with comments.
- **Provider Earnings (4 records + 1 audit):**
  - Statuses: `PAID`, `ELIGIBLE`, `PENDING` linked to subscription payments + 1 settlement audit trail.
- **Support Tickets (3 tickets):**
  - Statuses: `RESOLVED`, `IN_PROGRESS`, `OPEN`.
- **Menus:**
  - 14 Weekly menu slots (7 days × 2 providers).
  - 6 Daily menu specials (Lunch and Dinner for today and tomorrow).

---

## 4. QA Commands

Run from `d:\primeplate-qa\backend`:

```bash
# Seed or upsert QA synthetic data (idempotent, safe to rerun)
npm run qa:seed

# Reset and clear all QA data from Supabase QA database
npm run qa:reset

# Convenience: Reset + Seed fresh synthetic data
npm run qa:reseed

# Run automated validation of all 15 QA integrity rules
npm run qa:validate
```

---

## 5. Integration Services Status

| Service | Mode | Configuration / Status |
| :--- | :--- | :--- |
| **Database** | Supabase QA PostgreSQL | `aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres` (IPv4 session pooler, SSL enabled). |
| **Razorpay** | Test Mode | Backend: `rzp_test_...` / Frontend: `VITE_RAZORPAY_KEY_ID`. Synthetic payments use `pay_test_...` and `order_test_...`. |
| **Email (SMTP)** | Mailtrap QA | Backend configured for `smtp.mailtrap.io:2525`. |
| **Cloudinary** | Isolated QA Folder | Configured to upload to `primeplate_qa/` folder. |
