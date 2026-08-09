# Azure Infrastructure Setup

This document covers every Azure resource needed to run EvryBites in production. Follow the steps in order. Fill in the `.env` / App Service Application Settings columns as you go — redacted values are placeholders.

---

## Prerequisites

- Azure subscription with Owner or Contributor role
- Azure CLI installed (`az login` authenticated)
- Cloudflare account managing `evrybites.com`

---

## 1. Resource Group

Create a single resource group to hold everything:

```bash
az group create \
  --name evry-bites-rg \
  --location eastus
```

---

## 2. Azure App Service

```bash
# App Service Plan (Basic B1)
az appservice plan create \
  --name evry-bites-plan \
  --resource-group evry-bites-rg \
  --sku B1 \
  --is-linux

# Web App (Node 22 LTS)
az webapp create \
  --name evry-bites \
  --resource-group evry-bites-rg \
  --plan evry-bites-plan \
  --runtime "NODE:22-lts"
```

Default URL: `https://evry-bites.azurewebsites.net`

> Note the outbound IP addresses for the database firewall rule:
> ```bash
> az webapp show \
>   --name evry-bites \
>   --resource-group evry-bites-rg \
>   --query outboundIpAddresses \
>   --output tsv
> ```

---

## 3. Azure Database for PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --name evry-bites-db \
  --resource-group evry-bites-rg \
  --location eastus \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --admin-user evrybites \
  --admin-password "<STRONG_PASSWORD>" \
  --public-access None

# Create the application database
az postgres flexible-server db create \
  --server-name evry-bites-db \
  --resource-group evry-bites-rg \
  --database-name evry_bites

# Allow App Service outbound IPs (repeat for each IP from step 2)
az postgres flexible-server firewall-rule create \
  --server-name evry-bites-db \
  --resource-group evry-bites-rg \
  --rule-name allow-appservice-1 \
  --start-ip-address <IP_1> \
  --end-ip-address <IP_1>
```

**Connection string** (add to App Service settings as `DATABASE_URL`):
```
postgresql://evrybites:<PASSWORD>@evry-bites-db.postgres.database.azure.com/evry_bites?sslmode=require
```

---

## 4. Azure Communication Services

```bash
az communication create \
  --name evry-bites-acs \
  --resource-group evry-bites-rg \
  --location global \
  --data-location unitedstates
```

**Get the connection string** (add as `ACS_CONNECTION_STRING`):
```bash
az communication list-key \
  --name evry-bites-acs \
  --resource-group evry-bites-rg \
  --query primaryConnectionString \
  --output tsv
```

### 4a. Email — verify sender domain

1. In the Azure Portal → Communication Services → Email → Domains → Add domain
2. Choose **Azure-managed domain** for quickest setup (gives you `@<hash>.azurecomm.net`)
   - OR choose **Custom domain** and add `orders.evrybites.com` (requires DNS TXT verification in Cloudflare)
3. Copy the verified sender address (e.g. `DoNotReply@<hash>.azurecomm.net` or `orders@orders.evrybites.com`)
4. Add as `ACS_FROM_EMAIL` in App Service settings

### 4b. SMS — provision a phone number

1. Azure Portal → Communication Services → Phone Numbers → Get a number
2. Choose United States, toll-free, SMS-capable
3. Copy the provisioned number (e.g. `+18885551234`)
4. Add as `ACS_FROM_PHONE` in App Service settings

---

## 5. Azure Blob Storage

```bash
# Storage account (lowercase, 3-24 chars, globally unique)
az storage account create \
  --name evrybites \
  --resource-group evry-bites-rg \
  --location eastus \
  --sku Standard_LRS \
  --allow-blob-public-access true

# Public container for product images
az storage container create \
  --name product-images \
  --account-name evrybites \
  --public-access blob
```

**Connection string** (add as `AZURE_STORAGE_CONNECTION_STRING`):
```bash
az storage account show-connection-string \
  --name evrybites \
  --resource-group evry-bites-rg \
  --output tsv
```

`AZURE_STORAGE_CONTAINER_NAME` = `product-images`

---

## 6. App Service Application Settings

Set all environment variables from `.env.example` as Application Settings:

```bash
az webapp config appsettings set \
  --name evry-bites \
  --resource-group evry-bites-rg \
  --settings \
    DATABASE_URL="postgresql://evrybites:<PASSWORD>@evry-bites-db.postgres.database.azure.com/evry_bites?sslmode=require" \
    ADMIN_PASSWORD="<STRONG_PASSWORD>" \
    ACS_CONNECTION_STRING="<FROM_STEP_4>" \
    ACS_FROM_EMAIL="<FROM_STEP_4a>" \
    ACS_FROM_PHONE="<FROM_STEP_4b>" \
    AZURE_STORAGE_CONNECTION_STRING="<FROM_STEP_5>" \
    AZURE_STORAGE_CONTAINER_NAME="product-images" \
    OWNER_NOTIFICATION_EMAIL="orders@evrybites.com" \
    OWNER_NOTIFICATION_PHONE="<YOUR_CELL>" \
    ADMIN_TRUSTED_PHONES="<COMMA_SEPARATED_ADMIN_CELL_NUMBERS>" \
    VENMO_HANDLE="<YOUR_VENMO>" \
    PAYPAL_LINK="<YOUR_PAYPAL_LINK>" \
    NEXT_PUBLIC_VENMO_HANDLE="<YOUR_VENMO>" \
    NEXT_PUBLIC_PAYPAL_LINK="<YOUR_PAYPAL_LINK>"
```

---

## 7. DNS & HTTPS via Cloudflare

1. In the Azure Portal, get the App Service default hostname:
   `evry-bites.azurewebsites.net`

2. In Cloudflare DNS for `evrybites.com`:
   | Type  | Name | Content                          | Proxy |
   |-------|------|----------------------------------|-------|
   | CNAME | @    | evry-bites.azurewebsites.net     | ✓ (orange cloud) |
   | CNAME | www  | evry-bites.azurewebsites.net     | ✓ |

3. In Azure App Service → Custom domains → Add custom domain:
   - Add `evrybites.com` (validation method: CNAME/TXT as Azure instructs)
   - Add `www.evrybites.com`
   - **No Azure certificate needed** — Cloudflare proxy handles TLS

4. Set Cloudflare SSL/TLS mode to **Full** (not Full Strict, since the App Service default cert is for `*.azurewebsites.net`).

---

## 8. Business Email — `orders@evrybites.com`

1. In Cloudflare → Email Routing → Enable Email Routing for `evrybites.com`
2. Add a custom address: `orders@evrybites.com` → forward to the owner's personal inbox
3. Cloudflare will add the required MX and TXT records automatically

---

## 9. Run Database Migrations

Once the App Service is live and `DATABASE_URL` is set, run Prisma migrations:

```bash
# From your local machine with DATABASE_URL set to the production connection string:
DATABASE_URL="postgresql://..." npx prisma migrate deploy
DATABASE_URL="postgresql://..." npm run db:seed  # optional: seed initial products
```

---

## Provisioned Resources Summary

| Resource | Name | Location |
|----------|------|----------|
| Resource Group | `evry-bites-rg` | West US 2 |
| App Service Plan | `evry-bites-plan` | West US 2 (B1 Linux) |
| App Service | `evry-bites` | West US 2 |
| PostgreSQL Flexible Server | `evry-bites-db` | West US 2 (Standard_B1ms, PG 16) |
| Communication Services | `evry-bites-acs` | Global / unitedstates |
| Storage Account | `evrybites` | West US 2 (Standard_LRS) |
| Blob Container | `product-images` | public blob access |

Default App Service URL: `https://evry-bites.azurewebsites.net`
Production URL: `https://evrybites.com`
PostgreSQL FQDN: `evry-bites-db.postgres.database.azure.com`
ACS endpoint: `https://evry-bites-acs.unitedstates.communication.azure.com`

## Remaining Manual Steps

- [ ] **ACS email domain** — In Azure Portal → evry-bites-acs → Email → Domains → Add domain; set `ACS_FROM_EMAIL` App Setting
- [ ] **ACS SMS phone number** — In Azure Portal → evry-bites-acs → Phone Numbers → Get a number; set `ACS_FROM_PHONE` App Setting
- [ ] **Cloudflare DNS** — Add CNAME `@` and `www` → `evry-bites.azurewebsites.net` with proxy on; set SSL mode to Full
- [ ] **Azure custom domain** — In App Service → Custom domains → Add `evrybites.com` and `www.evrybites.com`
- [ ] **Cloudflare Email Routing** — Enable and add `orders@evrybites.com` → owner inbox
- [ ] **Payment settings** — Set `NEXT_PUBLIC_VENMO_HANDLE`, `NEXT_PUBLIC_PAYPAL_LINK`, `OWNER_NOTIFICATION_PHONE` App Settings
- [ ] **ADMIN_PASSWORD** — Change from `changeme` to a strong password in App Settings
- [ ] **Run migrations** — `DATABASE_URL="postgresql://evrybites:<pwd>@evry-bites-db.postgres.database.azure.com/evry_bites?sslmode=require" npx prisma migrate deploy`
- [ ] **Deploy app** — Set up CI/CD or run `az webapp deploy`
