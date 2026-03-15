# User Guide — Linode Cloud Compliance Manager (LCCM)

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Creating Your Admin Account](#2-creating-your-admin-account)
3. [Connecting Linode Accounts](#3-connecting-linode-accounts)
4. [Dashboard Overview](#4-dashboard-overview)
5. [Running a Sync](#5-running-a-sync)
6. [Compliance Results](#6-compliance-results)
7. [Rules & Security Profiles](#7-rules--security-profiles)
8. [Resources](#8-resources)
9. [Events](#9-events)
10. [Reports](#10-reports)
11. [Managing Users](#11-managing-users)
12. [User Roles](#12-user-roles)
13. [Exporting Data](#13-exporting-data)

---

## 1. Getting Started

LCCM is a cloud compliance management platform built for Linode (Akamai Cloud) infrastructure. It connects to one or more Linode accounts, syncs your infrastructure, and evaluates it against configurable compliance rules and security profiles.

**Key concepts:**

| Term | Meaning |
|---|---|
| Account | A Linode account connected via API token |
| Sync | Pulling the latest resource data from Linode |
| Evaluate | Running compliance rules against synced resources |
| Profile | A named collection of compliance rules (e.g. Foundation, Standard) |
| Result | The outcome of evaluating one rule against one resource |

---

## 2. Creating Your Admin Account

When you open the app for the first time, registration is open and you will be prompted to create the first admin account. Fill in your name, email address, and a strong password.

After the first account is created, registration is locked. Any additional users must be created by an admin from the Users page.

To log in on return visits, enter your email and password on the login screen.

---

## 3. Connecting Linode Accounts

Before any compliance data can be collected, you must connect at least one Linode account.

### Step 1 — Create a read-only API token in Linode

> **Important:** Always create a read-only token. LCCM only needs to read your infrastructure — it never creates, modifies, or deletes Linode resources.

1. Log in to the [Linode Cloud Manager](https://cloud.linode.com)
2. Go to your profile (top-right) → **API Tokens**
3. Click **Create a Personal Access Token**
4. Set a descriptive label (e.g. `LCCM Read-Only`)
5. Set an appropriate expiry (or no expiry if preferred)
6. For every permission, select **Read Only**
7. Click **Create Token** and copy the token immediately — it will not be shown again

### Step 2 — Add the account in LCCM

1. Navigate to **Accounts** in the left sidebar
2. Click **Add Account**
3. Enter a descriptive name for the account (e.g. `Production`)
4. Paste in the read-only API token you created
5. The Webhook API Key field is optional — leave it blank unless you have set up webhook-based event triggering
6. Click **Save**

You can add multiple Linode accounts. Each account is tracked and evaluated independently.

### Editing or removing an account

Click the edit icon on any account card to update the name or rotate the API token. Click the delete icon to remove an account and all its associated data.

---

## 4. Dashboard Overview

The Dashboard is the first page after login. It gives a high-level view of your compliance posture.

### Compliance Score Ring

The large circular indicator in the top section shows the overall compliance score as a percentage.

- **Green (80% or above):** Good compliance posture
- **Amber (60–79%):** Moderate issues requiring attention
- **Red (below 60%):** Significant compliance gaps

### Summary Cards

Below the score ring you will find three cards:

- **Compliant Checks** — number of rules passing across all resources
- **Non-Compliant Checks** — number of active failures
- **Total Resources** — count of all synced Linode resources

### Resources by Type

A grid showing how many resources of each type exist in the connected account (Linodes, Volumes, Databases, Firewalls, etc.).

### Top Failing Rules

A ranked list of the rules with the most failures, each showing a compliance bar and a pass/fail count. This helps prioritise remediation effort.

### Selecting an Account

Use the account selector in the top bar to switch between connected Linode accounts.

---

## 5. Running a Sync

A sync pulls fresh data from Linode and re-evaluates all compliance rules. You should run a sync after making infrastructure changes in Linode.

1. From the Dashboard or any page, click **Sync & Evaluate**
2. A progress panel will appear at the bottom of the screen
3. The sync runs in two phases:
   - **Sync Resources** — fetches all resources from the Linode API
   - **Evaluate Compliance** — runs all enabled rules against every resource
4. Live log output is shown during the process
5. When complete, a summary shows how many resources were synced and how many checks passed or failed
6. Click **Dismiss** to close the panel

You can also choose to run only the evaluation phase (skipping the resource fetch) if you have changed rule configurations but your infrastructure has not changed.

---

## 6. Compliance Results

The **Compliance** page shows every rule evaluation result across all your resources.

### Filters and Search

- **Search** — filter by rule name, resource name, or description
- **Status** — show only Compliant, Non-Compliant, or Not Applicable results
- **Severity** — filter by Critical, Warning, or Info

### Result Groups

Results are grouped by rule. Each rule section shows:

- The rule name and severity
- A count of passing and failing resources

Click any rule group to expand it and see individual resource results.

### Viewing Detail

Expand a resource row inside a rule group to see the full detail. For certain rule types the detail is formatted for readability — for example:

- **Login Allowed IPs** — lists IP addresses that made login attempts
- **Two-Factor Authentication** — lists users who do not have 2FA enabled
- **Inactive Users** — shows last login dates
- **Firewall Rules** — shows specific ports and protocols that violated the rule

### Acknowledging a Failure

If a non-compliant result is a known exception or accepted risk, you can acknowledge it:

1. Expand the resource row
2. Click **Acknowledge**
3. Optionally add a note explaining why it is accepted
4. Click **Confirm**

Acknowledged results are still counted but are visually distinguished and excluded from the primary non-compliant count. You can un-acknowledge at any time.

### Bulk Acknowledge

To acknowledge multiple results at once:

1. Check the checkbox on each result you want to acknowledge
2. Click **Bulk Acknowledge** in the toolbar
3. Enter a shared note (optional)
4. Confirm

### Adding Notes

You can add ongoing notes to any result to track remediation progress. Expand the result row and use the Notes section to add and view timestamped comments.

### Re-evaluate

Click **Re-evaluate** to run the compliance rules against the currently synced data without fetching new data from Linode. Useful after changing rule configurations.

---

## 7. Rules & Security Profiles

Navigate to **Rules** to manage which compliance rules are active and how they are configured.

### Security Profiles

Security profiles are pre-defined collections of rules grouped by tier:

| Tier | Description |
|---|---|
| Foundation | Basic hygiene checks suitable for all accounts |
| Standard | More comprehensive coverage including network security |
| Compliance | Checks aligned to common compliance frameworks |
| Advanced | Strict controls for high-security environments |

Click a profile to activate or deactivate it. Only one profile can be active per account at a time. Activating a profile enables all the rules it contains.

### Individual Rules

Below the profiles section, every available rule is listed. You can:

- **Search** by name, description, or resource type
- **Filter** by severity or enabled/disabled state
- **Toggle** individual rules on or off using the switch
- **Configure** rules that have adjustable parameters (look for the Configure button)

### Configuring a Rule

Many rules support customisation. Examples:

- **Approved Regions** — specify which Linode regions are allowed for your resources
- **Login Allowed IPs** — define the IP addresses permitted for console logins
- **No Open Inbound Ports** — choose which sensitive ports to protect
- **Required Tags** — define mandatory tag keys (or key:value pairs) that all resources must have
- **Minimum Kubernetes Version** — set a minimum acceptable LKE cluster version
- **Database Backup Recency** — define the maximum number of hours since the last backup

Click **Configure** on any configurable rule to open the editor. Make your changes and click **Save**. Click **Reset to Defaults** to restore the original values.

---

## 8. Resources

The **Resources** page shows every infrastructure item that has been synced from your Linode account.

### Resource Types

Resources are grouped by type:

- Linodes (virtual machines)
- Volumes (block storage)
- Databases (managed database clusters)
- Object Storage buckets
- Firewalls
- VPCs
- LKE Clusters (Kubernetes)
- NodeBalancers

### Filtering

Use the **Region** dropdown to narrow results to a specific Linode region.

### Resource Detail

Click any resource row to expand it and see:

- Full technical specifications (CPU, RAM, disk, plan, etc.)
- Last synced timestamp
- A **Timeline** button to view the compliance history for that resource over time
- An **Export** button to download the resource's compliance data

---

## 9. Events

The **Events** page shows the activity log pulled from the Linode API — a timeline of infrastructure changes such as Linodes being created, firewalls being modified, or backups running.

Use the search bar to filter by action type, entity name, or username.

This page is useful for correlating infrastructure changes with changes in your compliance score.

---

## 10. Reports

The **Reports** page lets you generate point-in-time compliance snapshots that can be saved, reviewed, and shared.

### Creating a Report

1. Click **New Report**
2. Choose between a **Quarterly** report (select year and quarter) or a **Custom** date range
3. Enter a title and optional description or auditor notes
4. Click **Generate**

Report generation captures the current compliance state as a snapshot. The snapshot is preserved — future syncs or rule changes will not alter an existing report.

### Viewing a Report

Click any report card to open the full report. It includes:

- Executive summary (score, compliant/non-compliant counts, resource breakdown)
- Active security profiles at the time the report was generated
- Rule-by-rule summary with compliance percentages
- Table of non-compliant findings
- Full results table

### Deleting a Report

Open a report and click the delete button. You will be asked to confirm. Deleted reports cannot be recovered.

---

## 11. Managing Users

Navigate to **Users** (visible to admins only) to manage who has access to the system.

### Creating a User

1. Click **Add User**
2. Enter the user's email address, full name, and a temporary password
3. Select a role (see the Roles section below)
4. Click **Save**

Users should change their password after first login.

### Account Access

By default, new users (other than admins) do not have access to any Linode accounts. To grant access:

1. Click the **Accounts** button on a user's card
2. In the modal, select the account from the dropdown and click **Grant Access**
3. To remove access, click **Revoke** next to an account

Admin users automatically have access to all accounts.

### Activating and Deactivating Users

Use the toggle on a user's card to deactivate their account without deleting it. Deactivated users cannot log in.

---

## 12. User Roles

| Role | Description |
|---|---|
| **Admin** | Full access to all features, all accounts, and user management |
| **Power User** | Can view and manage compliance, acknowledge results, configure rules, and run syncs. Cannot manage users |
| **Auditor** | Read-only access. Can view compliance results, reports, and resources but cannot make any changes |

---

## 13. Exporting Data

### From the Reports Page

Open any report and click the **Export** button. Three formats are available:

- **PDF** — a formatted document suitable for sharing with auditors or management. Includes a cover page, executive summary, and detailed findings tables with colour-coded severity indicators.
- **CSV** — a comma-separated file suitable for importing into spreadsheets or data tools.
- **XLS** — an Excel-compatible file with the same data as the CSV.

### From the Resources Page

Expand any resource row and click **Export** to download that resource's compliance results in PDF, CSV, or XLS format.

---

## Tips

- Always use **read-only** Linode API tokens. LCCM does not need write access to any resource.
- Run a sync after making significant infrastructure changes in Linode to keep compliance data current.
- Use the **acknowledge** feature to mark known exceptions so your compliance score reflects only genuine unaddressed issues.
- Use **security profiles** to quickly enable a relevant baseline of rules, then fine-tune with individual rule toggles and configurations.
- Generate quarterly reports at the end of each quarter to maintain a compliance audit trail.
- The **Events** page helps you investigate why your compliance score changed — look for infrastructure changes that coincide with score drops.
