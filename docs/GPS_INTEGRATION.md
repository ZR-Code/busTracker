# Connecting a district GPS system

BusBuddy does **not** currently integrate with any specific school district or GPS vendor, and claims no compatibility with one. It provides two vendor-neutral integration paths behind the common `BusLocationProvider` interface, so connecting a real feed changes no tracking, ETA or notification code.

## Option A — push (recommended)

The district (or a small bridge service it runs) POSTs positions to BusBuddy.

1. Generate a long random secret, for example `openssl rand -base64 32`, and set it on the server: `GPS_INGEST_API_KEY=<secret>`.
2. In **Admin → Buses**, set each real bus's *Location source* to **District GPS**. Its bus number must match the feed.
3. Send samples:

```http
POST /api/v1/ingest/locations
X-API-Key: <secret>
Content-Type: application/json

{
  "locations": [
    { "busNumber": "12", "lat": 41.7642, "lng": -88.1583, "heading": 270, "speedMps": 9.4,
      "recordedAt": "2026-10-23T12:05:03Z" }
  ]
}
```

The response is `202 { "accepted": 1, "ignored": 0 }`. Unknown bus numbers, and buses whose source isn't District GPS, are ignored. Up to 500 samples are accepted per request, at up to 600 requests per minute.

## Option B — pull adapter

`DistrictGpsProvider` (`apps/api/src/providers/db-providers.ts`) polls an HTTP endpoint every `DISTRICT_GPS_POLL_SECONDS`:

```
DISTRICT_GPS_BASE_URL=https://gps.example-district.invalid/api/
DISTRICT_GPS_API_KEY=<token issued by the vendor>
DISTRICT_GPS_POLL_SECONDS=10
```

It requests `GET {base}/vehicles/locations` with `Authorization: Bearer <key>` and expects this **generic BusBuddy feed format** (defined by `districtFeedSchema`):

```json
{ "vehicles": [ { "busNumber": "12", "latitude": 41.76, "longitude": -88.15, "headingDegrees": 270, "speedMps": 9.4, "timestamp": "2026-10-23T12:05:03Z" } ] }
```

Real vendors use their own formats and authentication. To integrate one:

1. Read the vendor's API documentation and obtain credentials under the district's agreement.
2. Replace the request in `poll()` and the mapping in `mapFeed()` with the vendor's endpoint, authentication and fields. Keep everything server-side.
3. Leave `getBusLocation(s)`, `record()` and the provider interface unchanged.

Credentials live only in server environment variables. They are never sent to the browser, never logged, and not part of `VITE_*` configuration.

## What happens to the data

- Samples are stored as `BusLocation` rows with `dataSource = district_gps` and kept for `LOCATION_HISTORY_RETENTION_MINUTES`.
- `LiveService` projects each position onto the route polyline to get the distance along the route and the off-route distance. It then runs the shared ETA engine against the route's timetable for today, in the school's time zone.
- If no sample arrives for `LOCATION_STALE_SECONDS`, the bus shows **Location update delayed**, its last update time is displayed, its ETA is marked uncertain, and reminders are paused for it.
- The UI labels this data **Live GPS**, distinct from **DEMO LIVE SIMULATION** and **Manual test location**.

## Testing without hardware

- In **Admin → Buses**, set a bus's source to **Manual test data** and use **Set location** (with an optional back-dated age to test stale handling).
- Or `curl` the ingest endpoint above with `GPS_INGEST_API_KEY` set locally.

## Implementing a new provider type

Implement `BusLocationProvider` (`apps/api/src/providers/types.ts`), add a value to the `DataSource` enum (Prisma schema and `packages/shared/src/constants.ts`), and register it in `ProviderRegistry`.
