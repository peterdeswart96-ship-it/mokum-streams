# Azure-setup & echte run — Mokum Streams (runbook)

Stap-voor-stap om van "code op develop" naar een **draaiende backend + eerste
echte stream** te komen. De code is klaar; dit zijn de infra- en configstappen.
PowerShell-voorbeelden (Peters shell). Resource group: `rg-mokum-streams`,
Key Vault: `kv-mokum-streams` (bestaan al, zie `docs/google-cloud-setup.md`).

> Bewuste keuze (globale regel): deploy met **`func azure functionapp publish`**,
> niet met `Azure/functions-action` (Flex Consumption geeft daar SCM-fouten).

## 1. Storage-account + Function App
```powershell
$rg   = "rg-mokum-streams"
$loc  = "westeurope"
$sa   = "mokumstreams$((Get-Random -Max 9999))"   # globaal uniek
$app  = "mokum-streams-func"

az storage account create -n $sa -g $rg -l $loc --sku Standard_LRS
# NB: bij een Consumption-plan alléén --consumption-plan-location (geen -l/--location
# ernaast, anders: "unrecognized arguments"). Gebruik --runtime-version 22:
# Node 20 = EOL (create weigert), en de door de CLI aangeraden Node 24 wordt op
# Linux Consumption NIET ondersteund (linuxFxVersion blijft "Error" → 503). 22 = LTS.
# Zet de runtime bij voorkeur hier bij create (pipe-vrij); linuxFxVersion achteraf
# wijzigen ('Node|22') is op Windows PowerShell lastig want de pipe bereikt az (.cmd)
# niet — desnoods de app deleten + opnieuw create met --runtime-version 22.
az functionapp create -n $app -g $rg `
  --storage-account $sa `
  --consumption-plan-location $loc `
  --runtime node --runtime-version 22 `
  --functions-version 4 `
  --os-type Linux
```

## 2. Managed identity + Key Vault-toegang (YouTube-secrets)
```powershell
az functionapp identity assign -n $app -g $rg
# NB: níet $pid gebruiken — dat is een read-only automatische PowerShell-variabele.
$principalId = az functionapp identity show -n $app -g $rg --query principalId -o tsv
az keyvault set-policy -n kv-mokum-streams --object-id $principalId --secret-permissions get list
```
> `kv-mokum-streams` staat op **RBAC** (`--enable-rbac-authorization`), dus
> `set-policy` faalt met "Cannot set policies to a vault with '--enable-rbac-authorization'".
> Gebruik een roltoewijzing (kan 1-2 min propageren):
> ```powershell
> $kvId = az keyvault show -n kv-mokum-streams --query id -o tsv
> az role assignment create `
>   --role "Key Vault Secrets User" `
>   --assignee-object-id $principalId `
>   --assignee-principal-type ServicePrincipal `
>   --scope $kvId
> ```

## 3. App settings
```powershell
# AGENT_TOKEN en ADMIN_TOKEN: genereer sterke willekeurige waarden en bewaar ze veilig.
az functionapp config appsettings set -n $app -g $rg --settings `
  KEY_VAULT_NAME=kv-mokum-streams `
  CUESCORE_ORG_STUB=mokumpooldarts `
  STORAGE_CONTAINER=mokum-streams `
  ADMIN_TOKEN=<sterk-token> `
  AGENT_TOKEN=<sterk-token>
# AzureWebJobsStorage wordt door 'functionapp create' al gezet (wordt ook als
# STORAGE_CONNECTION-fallback gebruikt door src/storage/blob.js).
```
> De YouTube-OAuth-secrets komen uit Key Vault via de managed identity — géén
> secrets in app settings of code.

## 4. Backend deployen
```powershell
cd backend
npm ci
func azure functionapp publish $app
```
Controleer: `https://$app.azurewebsites.net/api/health` geeft `{"status":"ok"}`.

## 5. Stream keys seeden (eenmalig)
Maakt per cameratafel een herbruikbare liveStream en schrijft `config/tables.json`:
```powershell
curl -X POST "https://$app.azurewebsites.net/api/manage/setup/streams" `
  -H "Authorization: Bearer <ADMIN_TOKEN>"
# → { tables: [{tableNumber, streamId}], hergebruikt, aangemaakt }
```
Haal daarna **eenmalig de stream key per tafel** op in **YouTube Studio**
(de key staat bewust niet in de API-respons) en configureer daarmee de juiste
**portable OBS-instantie** per tafel.

## 6. Agent installeren (streaming-pc)
Zie `agent/README.md`. Vul `agent-config.json`:
- `backendUrl = https://$app.azurewebsites.net`
- `AGENT_TOKEN` (env) = zelfde als hierboven
- per tafel de obs-websocket-poort + `OBS_PASSWORD_TAFEL_<nr>` (env)
Installeer als Windows-service (NSSM/node-windows).

## 7. Eerste echte test (#11)
1. Zet in het dashboard (of via `POST /api/manage/planning/{id}`) één toernooi
   **enabled** op één tafel, of gebruik een **ad-hoc** stream:
   `POST /api/manage/streams/start` body `{ "tableNumber": 1 }`.
2. De agent start de OBS-instantie → YouTube gaat via `enableAutoStart` live.
3. Controleer de livestream op het kanaal en `GET /api/live`.
4. Stoppen: `POST /api/manage/streams/stop` → agent `StopStream` → `enableAutoStop`.

## 8. CI-deploy activeren (optioneel, later)
Vervang in `.github/workflows/deploy-prod.yml` de placeholder-stap door:
```yaml
      - name: Deploy naar Azure Functions
        run: |
          npm i -g azure-functions-core-tools@4 --unsafe-perm true
          func azure functionapp publish mokum-streams-func
        working-directory: backend
        env:
          AZURE_...  # auth via azure/login of publish profile
```
Pas dit pas toe als de Function App + auth (OIDC/publish profile) klaarstaan,
anders faalt de prod-deploy. Zie ook de skill `azure-functions-deploy-fix` bij
SCM/503-fouten (Stop → Start van de Function App).
