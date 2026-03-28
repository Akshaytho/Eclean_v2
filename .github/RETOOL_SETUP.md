# eClean Admin — Retool Setup Guide

> Follow this step by step with Retool open in your browser.
> Total time: ~2-3 hours for a fully working admin panel.

---

## Step 1: Sign Up (2 minutes)

1. Go to **retool.com** → click "Start for free"
2. Sign up with your email
3. Choose "Build internal tools" when asked
4. Skip the onboarding tutorial

---

## Step 2: Get Your Admin Token (5 minutes)

You need a JWT token to authenticate API calls from Retool.

Open your terminal or Postman and run:

```bash
curl -X POST https://ecleanfuture-production.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@eclean.test", "password": "Test@1234"}'
```

Copy the `accessToken` from the response. It looks like:
```
eyJhbGciOiJIUzI1NiIs...very_long_string
```

> **Note:** This token expires in 15 minutes. For now that's fine — you'll
> paste it into Retool. For long-term use, you'll want to build a refresh
> flow or create a long-lived admin token (we can do that later).

---

## Step 3: Add REST API Resource (5 minutes)

This connects Retool to your backend API.

1. In Retool, click **Resources** (left sidebar) → **Create new** → **REST API**
2. Fill in:
   - **Name:** `eClean API`
   - **Base URL:** `https://ecleanfuture-production.up.railway.app/api/v1`
   - **Headers:** Add one header:
     - Key: `Authorization`
     - Value: `Bearer YOUR_ACCESS_TOKEN_HERE` (paste the token from Step 2)
   - **Headers:** Add another:
     - Key: `Content-Type`
     - Value: `application/json`
3. Click **Test connection** → should show green
4. Click **Save**

---

## Step 4: Add PostgreSQL Resource (5 minutes) — OPTIONAL

Direct database access for custom queries. Skip if you only want API access.

1. **Resources** → **Create new** → **PostgreSQL**
2. Get your connection string from Railway:
   - Go to Railway dashboard → your Postgres service → **Connect** tab
   - Copy the individual values:
     - **Host:** (something like `monorail.proxy.rlwy.net`)
     - **Port:** (usually `12345` or similar)
     - **Database name:** `railway`
     - **Username:** `postgres`
     - **Password:** (from Railway)
3. Paste into Retool, click **Test connection** → green
4. Click **Save**

---

## Step 5: Build the Dashboard Page (30 minutes)

This is your main admin home screen.

### Create the app:
1. Click **Apps** → **Create new** → **Create a blank app**
2. Name it: `eClean Admin`

### Add the platform stats query:
1. In the bottom panel, click **+** → **Resource query**
2. Select `eClean API`
3. Set:
   - **Action type:** GET
   - **URL path:** `/admin/dashboard`
4. Name the query: `getDashboard`
5. Click **Run** to test — you should see JSON with task counts, user counts, etc.

### Add stat cards:
Drag these components from the right panel onto the canvas:

**Row 1 — Key metrics (4 stat cards):**
- Drag a **Statistic** component → Label: `Total Tasks` → Value: `{{ getDashboard.data.tasks.total }}`
- Another Statistic → Label: `Completed` → Value: `{{ getDashboard.data.tasks.completed }}`
- Another Statistic → Label: `Disputed` → Value: `{{ getDashboard.data.tasks.disputed }}`
- Another Statistic → Label: `Active Users` → Value: `{{ getDashboard.data.users.total }}`

**Row 2 — Money:**
- Statistic → Label: `Total Revenue` → Value: `{{ '₹' + (getDashboard.data.totalAmountCents / 100).toFixed(0) }}`
- Statistic → Label: `Pending Reports` → Value: `{{ getDashboard.data.pendingReports }}`

### Add the analytics chart:
1. Create another query: `getAnalytics`
   - GET → `/analytics/platform?days=30`
2. Drag a **Chart** component onto the canvas
3. Set chart type: **Line**
4. Data source: `{{ getAnalytics.data.daily }}`
5. X-axis: `date`
6. Y-axis: `tasksCreated` (add another series for `tasksCompleted`)

---

## Step 6: Build the Users Page (20 minutes)

### Add a new page:
1. Click **Pages** (left sidebar) → **+ Add page** → Name: `Users`

### Add users query:
1. New query → `getUsers`
   - GET → `/admin/users?page=1&limit=50`
2. Run to test

### Add users table:
1. Drag a **Table** component onto the canvas
2. Data: `{{ getUsers.data.users }}`
3. Columns will auto-populate (id, name, email, role, isActive, createdAt)
4. Hide the `id` column (click column → toggle visibility)

### Add action buttons:
For each row, you want Deactivate/Activate and Verify Identity buttons.

1. In the table settings → **Action buttons** → Add:
   - **Button 1:** Label: `Deactivate`
     - Create a new query `deactivateUser`:
       - POST → `/admin/users/{{ usersTable.selectedRow.data.id }}/deactivate`
     - On click → Run `deactivateUser`, then run `getUsers` to refresh
   - **Button 2:** Label: `Activate`
     - POST → `/admin/users/{{ usersTable.selectedRow.data.id }}/activate`
   - **Button 3:** Label: `Verify`
     - POST → `/admin/users/{{ usersTable.selectedRow.data.id }}/verify-identity`

### Add role filter:
1. Drag a **Select** component above the table
2. Options: `WORKER, BUYER, SUPERVISOR, ADMIN, CITIZEN`
3. Update `getUsers` query URL: `/admin/users?role={{ roleFilter.value }}&page=1&limit=50`

---

## Step 7: Build the Disputes Page (20 minutes)

### New page: `Disputes`

### Query:
- `getDisputes` → GET → `/admin/disputes?page=1&limit=20`

### Table:
- Data: `{{ getDisputes.data.tasks }}`
- Show columns: title, status, buyer.name, worker.name, updatedAt, rejectionReason

### Resolve modal:
1. Drag a **Modal** component
2. Inside the modal, add:
   - A **Select** → Options: `APPROVE, REJECT` → Name: `decisionSelect`
   - A **Text Area** → Label: `Admin Notes (min 10 chars)` → Name: `adminNotes`
   - A **Button** → Label: `Resolve Dispute`
3. Create query `resolveDispute`:
   - POST → `/admin/disputes/{{ disputesTable.selectedRow.data.id }}/resolve`
   - Body (JSON):
   ```json
   {
     "decision": "{{ decisionSelect.value }}",
     "adminNotes": "{{ adminNotes.value }}"
   }
   ```
4. Button onClick → Run `resolveDispute`, then close modal, then refresh `getDisputes`

---

## Step 8: Build the Zones & Heatmap Page (20 minutes)

### New page: `Zones`

### Query:
- `getHeatmap` → GET → `/analytics/zones/heatmap?city=Hyderabad`

### Map:
1. Drag a **Map** component onto the canvas
2. Data: `{{ getHeatmap.data.features.map(f => ({ latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], label: f.properties.name + ' (Score: ' + f.properties.avgDirtyScore + ')' })) }}`
3. Default center: Hyderabad (17.385, 78.4867)

### Zone table below map:
- Data: `{{ getHeatmap.data.features.map(f => f.properties) }}`
- Sort by `avgDirtyScore` descending

### City filter:
- Add a **Text Input** above the map → Name: `cityFilter`
- Update query: `/analytics/zones/heatmap?city={{ cityFilter.value || 'Hyderabad' }}`

---

## Step 9: Build the Worker Leaderboard Page (15 minutes)

### New page: `Workers`

### Query:
- `getLeaderboard` → GET → `/analytics/workers/leaderboard?period=week&limit=20`

### Table:
- Data: `{{ getLeaderboard.data.leaderboard }}`
- Columns: rank, workerName, tasksCompleted, earningsCents (format as ₹), avgAiScore, daysActive

### Period filter:
- **Select** component → Options: `day, week, month`
- Update query URL: `...?period={{ periodFilter.value }}&limit=20`

### Worker detail drill-down:
- Add an action button on the table: `View Trend`
- Create query `getWorkerTrend`:
  - GET → `/analytics/workers/{{ workersTable.selectedRow.data.workerId }}/trend?days=30`
- On click → Open a modal with a **Chart** showing the worker's daily stats

---

## Step 10: Build the Photo Fraud Page (15 minutes)

### New page: `Photo Fraud`

### Query:
- `getFraud` → GET → `/analytics/photo-fraud?days=30`

### Stats at top:
- Statistic → `Total Photos: {{ getFraud.data.totalPhotos }}`
- Statistic → `Flagged: {{ getFraud.data.totalFlagged }}`
- Statistic → `Flag Rate: {{ getFraud.data.flagRate }}%`

### Table:
- Data: `{{ getFraud.data.flagged }}`
- Columns: taskId, uploaderId, mediaType, distanceFromTaskMeters, flagReason, createdAt

---

## Step 11: Build the API Keys Page (15 minutes)

### New page: `API Keys`

### Query:
- `getApiKeys` → GET → `/admin/api-keys`

### Table:
- Data: `{{ getApiKeys.data.apiKeys }}`
- Columns: keyPrefix, name, organizationName, permissions, rateLimitTier, isActive, lastUsedAt

### Create key form (Modal):
1. Add a **Button** above table: `+ Create API Key`
2. On click → Open modal with form:
   - Text Input → `name` (e.g. "GHMC Production")
   - Text Input → `organizationName` (e.g. "Greater Hyderabad Municipal Corporation")
   - Text Input → `contactEmail`
   - Multiselect → `permissions` → Options: `zones, waste_patterns, cleanliness_index, drain_risk`
   - Select → `rateLimitTier` → Options: `standard, premium, unlimited`
   - Number Input → `expiresInDays` (optional, e.g. 365)
3. Create query `createApiKey`:
   - POST → `/admin/api-keys`
   - Body:
   ```json
   {
     "name": "{{ nameInput.value }}",
     "organizationName": "{{ orgInput.value }}",
     "contactEmail": "{{ emailInput.value }}",
     "permissions": {{ JSON.stringify(permissionsSelect.value) }},
     "rateLimitTier": "{{ tierSelect.value }}",
     "expiresInDays": {{ expiresInput.value || 'null' }}
   }
   ```
4. **IMPORTANT:** After creation, show the `rawKey` in an alert/modal.
   Tell the user: "Copy this key NOW. It cannot be retrieved again."

### Revoke button:
- Action button on table → `Revoke`
- POST → `/admin/api-keys/{{ apiKeysTable.selectedRow.data.id }}/revoke`

---

## Step 12: Build the Supply-Demand Page (10 minutes)

### New page: `Supply & Demand`

### Query:
- `getSupplyDemand` → GET → `/analytics/supply-demand?city=Hyderabad`

### Table:
- Data: `{{ getSupplyDemand.data.zones }}`
- Columns: zoneName, city, openTasks, activeWorkers, status
- Color the `status` column:
  - NO_SUPPLY → red
  - UNDER_SUPPLIED → orange
  - BALANCED → green
  - IDLE → gray

### Summary stats:
- `Total Open Tasks: {{ getSupplyDemand.data.summary.totalOpenTasks }}`
- `Active Workers: {{ getSupplyDemand.data.summary.totalActiveWorkers }}`
- `Under-supplied Zones: {{ getSupplyDemand.data.summary.underSuppliedZones }}`

---

## Step 13: Navigation (5 minutes)

1. Click the **Navigation** settings (gear icon, top-left)
2. Add all your pages to the sidebar:
   - Dashboard
   - Users
   - Disputes
   - Zones
   - Workers
   - Photo Fraud
   - API Keys
   - Supply & Demand

---

## Token Refresh (Important!)

The admin JWT expires every 15 minutes. Two options:

**Option A (quick fix):** When the token expires, re-login via curl and update
the `Authorization` header in Retool's eClean API resource settings.

**Option B (proper fix — do this later):** Create a Retool "workflow" that:
1. Calls POST `/auth/login` with admin credentials
2. Stores the accessToken in a Retool variable
3. All queries use `Bearer {{ accessTokenVar.value }}`
4. A timer re-runs the login every 10 minutes

---

## Summary of Retool Pages

| Page | API Endpoints Used | Components |
|------|-------------------|------------|
| Dashboard | `/admin/dashboard` + `/analytics/platform` | Stat cards + line chart |
| Users | `/admin/users` + activate/deactivate/verify | Table + action buttons + filter |
| Disputes | `/admin/disputes` + resolve | Table + modal with form |
| Zones | `/analytics/zones/heatmap` | Map + table + city filter |
| Workers | `/analytics/workers/leaderboard` + trend | Table + chart modal + period filter |
| Photo Fraud | `/analytics/photo-fraud` | Stats + table |
| API Keys | `/admin/api-keys` + create/revoke | Table + create modal |
| Supply & Demand | `/analytics/supply-demand` | Table + stats + city filter |

---

## What You'll Have When Done

- Live platform dashboard with charts
- User management (activate/deactivate/verify workers)
- Dispute resolution queue
- Zone heatmap on a real map
- Worker leaderboard with drill-down
- Photo fraud detection review
- B2B API key management (onboard municipal corporations)
- Supply-demand monitoring per zone

All of this powered by the analytics engine we just built. The data gets
richer every day the platform runs.
